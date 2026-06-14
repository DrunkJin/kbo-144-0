// ────────────────────────────────────────────────────────────────────────────
// KBO 공식 기록실 크롤러 (증분 갱신용)
//
//   사용: npm run crawl 2025            (한 시즌)
//         npm run crawl 2023 2024 2025   (여러 시즌)
//         npm run crawl 2025 --debug     (발견한 표 헤더 덤프)
//
// 동작: 각 시즌의 타자/투수 기록 페이지를 받아 표를 파싱 → 정규화 → 기존
//   data/players.json 의 해당 시즌을 교체/추가 → 웹 청크 재생성(buildOutputs).
//
// 설계: KBO 사이트는 ASP.NET WebForms(__VIEWSTATE 포스트백)라, (1) 페이지를 GET
//   해 hidden 필드와 '연도' <select> 이름을 자동 발견하고, (2) 연도를 선택하는
//   포스트백을 보내고, (3) '선수명'·'AVG/ERA' 헤더를 가진 표를 헤더 텍스트로
//   매핑해 파싱한다(긴 ASP.NET id에 의존하지 않음). 페이지네이션은 doPostBack
//   링크를 따라간다.
//
// ⚠️ robots.txt: /Record/ 는 허용(/ws/, /Common/ 차단). 요청 간 지연을 둔다.
// ⚠️ 해외 IP는 차단될 수 있다 — 한국 네트워크에서 실행 권장. 사이트 DOM이
//    바뀌면 HEADER_MAP / 표 선택 휴리스틱만 손보면 된다(--debug 로 확인).
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import type { BatLine, PitLine, Player, Position } from "../src/types.ts";
import { buildOutputs, DATA_FILE } from "./lib/buildOutputs.ts";

const BASE = "https://www.koreabaseball.com";
// 타자/투수별로 필요한 컬럼이 여러 탭에 흩어져 있어 Basic+Detail 을 모두 받아 병합.
const PAGES = {
  bat: ["/Record/Player/HitterBasic/Basic.aspx", "/Record/Player/HitterBasic/Detail1.aspx"],
  pit: ["/Record/Player/PitcherBasic/Basic.aspx", "/Record/Player/PitcherBasic/Detail1.aspx"],
};
const REQUEST_DELAY_MS = 1500; // 정중하게
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── 헤더 텍스트 → 우리 필드 (대소문자·공백 무시, 한/영 모두) ──────────────────
const HEADER_MAP: Record<string, string> = {
  "선수명": "name", "선수": "name", name: "name", player: "name",
  "팀명": "team", "팀": "team", team: "team",
  // batting
  pa: "PA", "타석": "PA", ab: "AB", "타수": "AB", h: "H", "안타": "H",
  "2b": "d2B", "2루타": "d2B", "3b": "d3B", "3루타": "d3B", hr: "HR", "홈런": "HR",
  rbi: "RBI", "타점": "RBI", sb: "SB", "도루": "SB",
  bb: "BB", "볼넷": "BB", hbp: "HBP", hp: "HBP", "사구": "HBP", so: "SO", "삼진": "SO",
  // pitching
  ip: "IP", "이닝": "IP", er: "ER", "자책": "ER", "자책점": "ER",
  tbf: "BF", "타자": "BF", gs: "GS", "선발": "GS",
  sv: "SV", s: "SV", "세이브": "SV", w: "W", "승": "W",
  // pitcher uses same h/hr/bb/hbp/so headers (mapped above) — handled per-kind below
};

// ── 정중한 fetch (쿠키 유지 + 재시도 + 지연) ─────────────────────────────────
let cookies = "";
let lastReq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function polite(url: string, init?: RequestInit): Promise<string> {
  const wait = REQUEST_DELAY_MS - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9",
          "Referer": BASE + "/",
          ...(cookies ? { Cookie: cookies } : {}),
          ...(init?.method === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(init?.headers ?? {}),
        },
      });
      lastReq = Date.now();
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookies = sc.map((c) => c.split(";")[0]).join("; ");
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location") ?? "";
        if (/Error/i.test(loc)) throw new Error(`blocked → ${loc}`);
      }
      return await res.text();
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  return "";
}

// ── HTML 파싱 유틸 ───────────────────────────────────────────────────────────
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
const norm = (s: string) => stripTags(s).toLowerCase().replace(/\s+/g, "");

/** 모든 hidden input (name→value) — 포스트백에 그대로 되돌려 보냄. */
function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    const name = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    const value = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    if (name) out[name] = value;
  }
  return out;
}

/** 옵션에 4자리 연도가 들어있는 <select> 의 name (연도 드롭다운). */
function yearSelectName(html: string): string | null {
  const re = /<select[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/<option[^>]*value=["']?(19|20)\d{2}["']?/.test(m[2])) return m[1];
  }
  return null;
}

/** doPostBack('target','arg') 링크들 — 페이지네이션 타깃 탐색용. */
function postbackTargets(html: string): { target: string; arg: string }[] {
  const re = /__doPostBack\((?:&#39;|['"])([^'"&]+)(?:&#39;|['"]),\s*(?:&#39;|['"])([^'"&]*)(?:&#39;|['"])\)/g;
  const out: { target: string; arg: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ target: m[1], arg: m[2] });
  return out;
}

/** 기록 표(헤더에 '선수명' 포함)를 골라 헤더/행으로 분해. */
function parseRecordTable(html: string): { headers: string[]; rows: string[][] } | null {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const t of tables) {
    if (!/선수명|선수/.test(t)) continue;
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue;
    const cellsOf = (tr: string) =>
      (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map(stripTags);
    const headers = cellsOf(rows[0] ?? "");
    if (!headers.some((h) => /선수/.test(h))) continue;
    const body = rows.slice(1).map(cellsOf).filter((r) => r.length === headers.length);
    return { headers, rows: body };
  }
  return null;
}

const toNum = (s: string | undefined): number => {
  const v = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
/** KBO 이닝 표기 8.1 = 8⅓. */
function parseIP(s: string | undefined): number {
  const v = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(v)) return 0;
  const whole = Math.trunc(v);
  const frac = Math.round((v - whole) * 10);
  return whole + (frac === 1 ? 1 / 3 : frac === 2 ? 2 / 3 : 0);
}

/** 한 종류(타자/투수)의 한 시즌을 크롤 → {key → 필드맵} 병합 결과. */
async function crawlKind(kind: "bat" | "pit", year: number, debug: boolean): Promise<Map<string, Record<string, string>>> {
  const merged = new Map<string, Record<string, string>>();
  for (const path of PAGES[kind]) {
    const url = BASE + path;
    let html: string;
    try {
      html = await polite(url);
    } catch (e) {
      console.warn(`  ! ${path} GET 실패: ${(e as Error).message}`);
      continue;
    }
    const ddl = yearSelectName(html);
    if (ddl) {
      const body = new URLSearchParams({ ...hiddenFields(html), __EVENTTARGET: ddl, __EVENTARGUMENT: "", [ddl]: String(year) });
      html = await polite(url, { method: "POST", body: body.toString() });
    }

    const seen = new Set<string>();
    let page = 0;
    while (true) {
      const table = parseRecordTable(html);
      if (!table) break;
      if (debug && page === 0) console.log(`  [debug] ${path} 헤더:`, table.headers.join(" | "));
      const idx: Record<string, number> = {};
      table.headers.forEach((h, i) => {
        const f = HEADER_MAP[norm(h)];
        if (f) idx[f] = i;
      });
      if (idx.name === undefined) break;
      for (const r of table.rows) {
        const rec: Record<string, string> = {};
        for (const [field, i] of Object.entries(idx)) rec[field] = r[i];
        const key = `${rec.name}|${rec.team ?? ""}`;
        merged.set(key, { ...merged.get(key), ...rec });
      }
      // 다음 페이지 (pager 포스트백) 탐색
      const next = postbackTargets(html).find((t) => /pager|paging|btnNo|Next|다음/i.test(t.target) && !seen.has(t.target + t.arg));
      if (!next || page++ > 30) break;
      seen.add(next.target + next.arg);
      const body = new URLSearchParams({ ...hiddenFields(html), __EVENTTARGET: next.target, __EVENTARGUMENT: next.arg });
      html = await polite(url, { method: "POST", body: body.toString() });
    }
  }
  return merged;
}

function inferPitPos(line: PitLine): Position {
  if (line.SV >= 15) return "CL";
  if (line.GS >= 10) return "SP";
  return "RP";
}
function rarityFromWar(war: number): Player["rarity"] {
  if (war >= 6) return "legendary";
  if (war >= 4) return "epic";
  if (war >= 2) return "rare";
  return "common";
}

function toPlayers(kind: "bat" | "pit", year: number, recs: Map<string, Record<string, string>>): Player[] {
  const out: Player[] = [];
  for (const rec of recs.values()) {
    const name = rec.name;
    const team = rec.team || "UNK";
    if (!name) continue;
    if (kind === "bat") {
      const bat: BatLine = {
        PA: toNum(rec.PA), AB: toNum(rec.AB), H: toNum(rec.H), d2B: toNum(rec.d2B),
        d3B: toNum(rec.d3B), HR: toNum(rec.HR), RBI: toNum(rec.RBI), BB: toNum(rec.BB),
        HBP: toNum(rec.HBP), SO: toNum(rec.SO), SB: toNum(rec.SB),
      };
      if (bat.PA < 1 && bat.AB < 1) continue;
      // 공식 페이지엔 수비 포지션이 없어 DH 로 — 추후 보강 필요
      out.push({ id: `${year}-${team}-${name}`, name, team, season: year, primaryPos: "DH", eligiblePos: ["DH"], bat, war: 0, rarity: "common" });
    } else {
      const pit: PitLine = {
        IP: parseIP(rec.IP), ER: toNum(rec.ER), H: toNum(rec.H), HR: toNum(rec.HR),
        BB: toNum(rec.BB), HBP: toNum(rec.HBP), SO: toNum(rec.SO), BF: toNum(rec.BF),
        GS: toNum(rec.GS), SV: toNum(rec.SV), W: toNum(rec.W),
      };
      if (pit.IP < 1) continue;
      const pos = inferPitPos(pit);
      out.push({ id: `${year}-${team}-${name}-P`, name, team, season: year, primaryPos: pos, eligiblePos: [pos], pit, war: 0, rarity: rarityFromWar(0) });
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
  if (years.length === 0) {
    console.error("사용법: npm run crawl <연도> [연도...] [--debug]   예) npm run crawl 2025");
    process.exit(1);
  }

  // 세션 워밍업: 기록 페이지 직접 진입은 세션 쿠키가 없으면 에러로 리다이렉트됨.
  // 먼저 메인을 한 번 받아 ASP.NET 세션 쿠키를 확보한다.
  try {
    await polite(BASE + "/");
    await polite(BASE + "/Record/Player/HitterBasic/Basic.aspx");
  } catch { /* 워밍업 실패는 무시하고 진행 */ }

  const existing: Player[] = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, "utf8")) : [];
  const crawled: Player[] = [];
  for (const year of years) {
    console.log(`\n[${year}] 크롤링…`);
    const bat = toPlayers("bat", year, await crawlKind("bat", year, debug));
    const pit = toPlayers("pit", year, await crawlKind("pit", year, debug));
    console.log(`  타자 ${bat.length}명 · 투수 ${pit.length}명`);
    if (bat.length + pit.length === 0) console.warn(`  ⚠️ ${year} 수집 0건 — 차단/DOM 변경 가능. --debug 로 헤더 확인.`);
    crawled.push(...bat, ...pit);
  }

  // 크롤한 시즌은 기존 데이터에서 제거 후 교체
  const crawledSeasons = new Set(years);
  const kept = existing.filter((p) => !crawledSeasons.has(p.season));
  const merged = [...kept, ...crawled];
  if (crawled.length === 0) { console.error("수집 결과가 없어 출력하지 않습니다."); process.exit(1); }
  buildOutputs(merged);
  console.log(`\n⚠️ 공식 페이지엔 WAR·수비 포지션이 없어 타자는 DH/WAR 0 으로 들어갑니다.`);
  console.log(`   포지션·WAR 보강(Statiz 등)이나 Kaggle 백필과 병합을 권장합니다.`);
}

main();
