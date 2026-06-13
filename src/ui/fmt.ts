import type { Player, Position } from "../types.ts";
import { wOBA, fip } from "../sim/runEstimator.ts";

const POS_KR: Record<Position, string> = {
  C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수",
  LF: "좌익수", CF: "중견수", RF: "우익수", DH: "지명타자",
  SP: "선발", RP: "계투", CL: "마무리",
};

const PITCHER_POS: Position[] = ["SP", "RP", "CL"];

export function posKR(pos: Position): string {
  return POS_KR[pos] ?? pos;
}

export function isPitcher(p: Player): boolean {
  return PITCHER_POS.includes(p.primaryPos) || (!p.bat && !!p.pit);
}

/** Stable identity of the PERSON (so the same player can't be drafted twice,
 *  even from a different club-season card). */
export function playerKey(p: Player): string {
  return (p.pid ?? p.name) + (isPitcher(p) ? "-P" : "-B");
}

/** "bat" | "pit" — drives the color coding on cards. */
export function playerKind(p: Player): "bat" | "pit" {
  return isPitcher(p) ? "pit" : "bat";
}

/** One-line stat summary for a player card. */
export function statLine(p: Player): string {
  if (p.bat && p.bat.PA > 0) {
    const b = p.bat;
    const avg = b.AB ? (b.H / b.AB).toFixed(3).replace(/^0/, "") : ".000";
    return `${avg} · ${b.HR}홈런 · wOBA ${wOBA(b).toFixed(3)}`;
  }
  if (p.pit && p.pit.IP > 0) {
    return `${p.pit.IP.toFixed(0)}이닝 · ${p.pit.SO}K · FIP ${fip(p.pit).toFixed(2)}`;
  }
  return "—";
}

/** Friendly Korean label for a roster slot key. */
export function slotLabel(key: string, pos: Position): string {
  if (key.startsWith("BENCH")) return `벤치 (${posKR(pos)})`;
  if (/^SP\d$/.test(key)) return `선발 ${key.slice(2)}`;
  if (/^RP\d$/.test(key)) return `계투 ${key.slice(2)}`;
  if (key === "CL") return "마무리";
  return posKR(pos);
}
