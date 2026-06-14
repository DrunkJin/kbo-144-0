// ────────────────────────────────────────────────────────────────────────────
// Ingest Kaggle KBO CSVs -> normalized player JSON (data/players/players.json).
//
// Usage:
//   1. Download CSVs into data/raw/  (see scripts/README.md)
//   2. Adjust COLUMN_MAP below to match your dataset's headers
//   3. npm run ingest
//
// No external deps — tiny CSV parser inline. Run with node --experimental-strip-types.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BatLine, PitLine, Player, Position } from "../src/types.ts";
import { buildLeagueTable } from "../src/sim/leagueTable.ts";
import { buildPrimeIndex } from "../src/data/load.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, "../data/raw");
// Full dataset for node scripts (NOT public — kept out of the web bundle).
const OUT_FILE = join(__dirname, "../data/players.json");
// Web-served chunks the app fetches lazily.
const PUB = join(__dirname, "../public/data");

// ── Column mapping — EDIT to match your CSV headers (case-insensitive) ───────
// Different Kaggle datasets name columns differently (e.g. "2B" vs "doubles",
// "name" vs "Name" vs "player"). Map our canonical fields to your headers.
const COLUMN_MAP = {
  pid: ["id", "playerid", "선수id"],
  name: ["name", "player", "선수명", "선수"],
  team: ["team", "tm", "팀"],
  season: ["year", "season", "연도", "시즌"],
  pos: ["pos.", "pos", "position", "포지션"],
  war: ["war"],
  // batting
  PA: ["pa", "타석"], AB: ["ab", "타수"], H: ["h", "안타"],
  d2B: ["2b", "doubles", "2루타"], d3B: ["3b", "triples", "3루타"], HR: ["hr", "홈런"],
  RBI: ["rbi", "타점"],
  BB: ["bb", "볼넷"], HBP: ["hp", "hbp", "사구"], SO: ["so", "k", "삼진"], SB: ["sb", "도루"],
  // pitching
  IP: ["ip", "이닝"], ER: ["er", "자책"], pH: ["h", "피안타"], pHR: ["hr", "피홈런"],
  pBB: ["bb", "볼넷"], pHBP: ["hp", "hbp", "사구"], pSO: ["so", "k", "탈삼진"],
  BF: ["tbf", "bf", "상대타자"], GS: ["gs", "선발"], SV: ["s", "sv", "세이브"], W: ["w", "승"],
} as const;

/** KBO/baseball IP notation: 8.1 = 8⅓, 8.2 = 8⅔. Convert to true decimal. */
function parseIP(s: string | undefined): number {
  const v = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(v)) return 0;
  const whole = Math.trunc(v);
  const frac = Math.round((v - whole) * 10); // .1 or .2
  return whole + (frac === 1 ? 1 / 3 : frac === 2 ? 2 / 3 : 0);
}

/** Map a dataset position string to eligible game slots. Everyone can DH. */
function batterEligible(raw: string | undefined): Position[] {
  const p = (raw ?? "").toUpperCase().replace(/\./g, "").trim();
  const map: Record<string, Position[]> = {
    C: ["C"], "1B": ["1B"], "2B": ["2B"], "3B": ["3B"], SS: ["SS"],
    LF: ["LF"], CF: ["CF"], RF: ["RF"], DH: [],
    OF: ["LF", "CF", "RF"], IF: ["1B", "2B", "3B", "SS"],
  };
  const base = map[p] ?? [];
  return Array.from(new Set<Position>([...base, "DH"]));
}

// ── tiny CSV parser (handles quoted fields & commas) ─────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function pick(rec: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== "") return rec[k];
  return undefined;
}
const num = (s: string | undefined): number => {
  const v = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};

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

function toPlayer(rec: Record<string, string>, kind: "bat" | "pit"): Player | null {
  const name = pick(rec, COLUMN_MAP.name);
  const team = pick(rec, COLUMN_MAP.team) ?? "UNK";
  const season = num(pick(rec, COLUMN_MAP.season));
  const war = num(pick(rec, COLUMN_MAP.war));
  const pid = pick(rec, COLUMN_MAP.pid);
  if (!name || !season) return null;

  if (kind === "bat") {
    const bat: BatLine = {
      PA: num(pick(rec, COLUMN_MAP.PA)), AB: num(pick(rec, COLUMN_MAP.AB)),
      H: num(pick(rec, COLUMN_MAP.H)), d2B: num(pick(rec, COLUMN_MAP.d2B)),
      d3B: num(pick(rec, COLUMN_MAP.d3B)), HR: num(pick(rec, COLUMN_MAP.HR)),
      RBI: num(pick(rec, COLUMN_MAP.RBI)),
      BB: num(pick(rec, COLUMN_MAP.BB)), HBP: num(pick(rec, COLUMN_MAP.HBP)),
      SO: num(pick(rec, COLUMN_MAP.SO)), SB: num(pick(rec, COLUMN_MAP.SB)),
    };
    if (bat.PA < 1) return null;
    const eligible = batterEligible(pick(rec, COLUMN_MAP.pos));
    const primary = (eligible.find((p) => p !== "DH") ?? "DH") as Position;
    return {
      id: `${season}-${team}-${name}`, pid, name, team, season,
      primaryPos: primary, eligiblePos: eligible, bat, war, rarity: rarityFromWar(war),
    };
  } else {
    const pit: PitLine = {
      IP: parseIP(pick(rec, COLUMN_MAP.IP)), ER: num(pick(rec, COLUMN_MAP.ER)),
      H: num(pick(rec, COLUMN_MAP.pH)), HR: num(pick(rec, COLUMN_MAP.pHR)),
      BB: num(pick(rec, COLUMN_MAP.pBB)), HBP: num(pick(rec, COLUMN_MAP.pHBP)),
      SO: num(pick(rec, COLUMN_MAP.pSO)), BF: num(pick(rec, COLUMN_MAP.BF)),
      GS: num(pick(rec, COLUMN_MAP.GS)), SV: num(pick(rec, COLUMN_MAP.SV)),
      W: num(pick(rec, COLUMN_MAP.W)),
    };
    if (pit.IP < 1) return null;
    const pos = inferPitPos(pit);
    return {
      id: `${season}-${team}-${name}-P`, pid, name, team, season,
      primaryPos: pos, eligiblePos: [pos], pit, war, rarity: rarityFromWar(war),
    };
  }
}

function main() {
  if (!existsSync(RAW_DIR)) {
    console.error(`No raw dir: ${RAW_DIR}\nDownload CSVs there first (see scripts/README.md).`);
    process.exit(1);
  }
  const files = readdirSync(RAW_DIR).filter(
    (f) => f.toLowerCase().endsWith(".csv") && !/career|total/i.test(f),
  );
  if (files.length === 0) { console.error("No season CSV files in data/raw/"); process.exit(1); }

  const players: Player[] = [];
  for (const f of files) {
    const kind: "bat" | "pit" = /pitch|투수/i.test(f) ? "pit" : "bat";
    const recs = parseCSV(readFileSync(join(RAW_DIR, f), "utf8"));
    let ok = 0;
    for (const r of recs) {
      const p = toPlayer(r, kind);
      if (p) { players.push(p); ok++; }
    }
    console.log(`  ${f}  [${kind}]  ${ok}/${recs.length} rows`);
  }

  // ── full dataset (for node scripts) ──
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(players, null, 0));

  // ── chunked, web-served outputs ──
  const seasonsDir = join(PUB, "seasons");
  rmSync(seasonsDir, { recursive: true, force: true });
  mkdirSync(seasonsDir, { recursive: true });

  const bySeason = new Map<number, Player[]>();
  for (const p of players) {
    const arr = bySeason.get(p.season) ?? [];
    arr.push(p);
    bySeason.set(p.season, arr);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  for (const [year, arr] of bySeason) {
    writeFileSync(join(seasonsDir, `${year}.json`), JSON.stringify(arr, null, 0));
  }

  // tiny index (loaded instantly on startup)
  writeFileSync(join(PUB, "index.json"), JSON.stringify({
    seasons, minSeason: seasons[0], maxSeason: seasons[seasons.length - 1],
    totalPlayers: players.length,
  }));

  // precomputed per-season league constants — removes the need to load all
  // players client-side just to era-adjust.
  writeFileSync(join(PUB, "league-table.json"), JSON.stringify(buildLeagueTable(players)));

  // prime index: career-best season per player (lazy-loaded only in Prime mode)
  const prime = buildPrimeIndex(players);
  const primeObj: Record<string, unknown> = {};
  for (const [k, p] of prime) {
    primeObj[k] = { season: p.season, bat: p.bat, pit: p.pit, war: p.war, rarity: p.rarity };
  }
  writeFileSync(join(PUB, "prime.json"), JSON.stringify(primeObj));

  console.log(`\n✅  ${players.length} player-seasons`);
  console.log(`    full: ${OUT_FILE}`);
  console.log(`    web : ${seasons.length} season chunks + index + league-table + prime → ${PUB}`);
}

main();
