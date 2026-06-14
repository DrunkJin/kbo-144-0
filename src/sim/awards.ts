// End-of-season awards: the leader in each category among MY drafted roster,
// shown with the stat that won it. (No RBI/W in the dataset → those omitted.)

import type { BatLine, Player, Team } from "../types.ts";
import { OBP, AVG } from "./runEstimator.ts";

export interface Award {
  title: string;
  icon: string;
  player: Player;
  stat: string;
}

function slg(b: BatLine): number {
  return b.AB > 0 ? (b.H + b.d2B + 2 * b.d3B + 3 * b.HR) / b.AB : 0;
}
function era(p: NonNullable<Player["pit"]>): number {
  return p.IP > 0 ? (p.ER * 9) / p.IP : 99;
}

/** Player maximizing `score` among those passing `ok`. */
function leader(arr: Player[], score: (p: Player) => number, ok: (p: Player) => boolean): Player | null {
  const elig = arr.filter(ok);
  if (!elig.length) return null;
  return elig.reduce((a, b) => (score(b) > score(a) ? b : a));
}

export function computeAwards(team: Team): Award[] {
  const hitters = team.lineup.filter((p) => p.bat && p.bat.PA > 0);
  const pitchers = [...team.rotation, ...team.bullpen].filter((p) => p.pit && p.pit.IP > 0);
  const all = [...hitters, ...pitchers];
  const out: Award[] = [];
  const add = (title: string, icon: string, p: Player | null, stat: (p: Player) => string) => {
    if (p) out.push({ title, icon, player: p, stat: stat(p) });
  };

  add("MVP", "🏆", all.length ? all.reduce((a, b) => ((b.war ?? -99) > (a.war ?? -99) ? b : a)) : null,
    (p) => `WAR ${p.war?.toFixed(2) ?? "—"}`);
  add("타격왕", "🎯", leader(hitters, (p) => AVG(p.bat!), (p) => p.bat!.AB > 0),
    (p) => `타율 ${AVG(p.bat!).toFixed(3).replace(/^0/, "")}`);
  add("홈런왕", "💥", leader(hitters, (p) => p.bat!.HR, () => true), (p) => `${p.bat!.HR}홈런`);
  add("타점왕", "🧨", leader(hitters, (p) => p.bat!.RBI, () => true), (p) => `${p.bat!.RBI}타점`);
  add("출루왕", "🧲", leader(hitters, (p) => OBP(p.bat!), (p) => p.bat!.PA > 0),
    (p) => `출루율 ${OBP(p.bat!).toFixed(3).replace(/^0/, "")}`);
  add("장타왕", "🚀", leader(hitters, (p) => slg(p.bat!), (p) => p.bat!.AB > 0),
    (p) => `장타율 ${slg(p.bat!).toFixed(3).replace(/^0/, "")}`);
  add("도루왕", "🏃", leader(hitters, (p) => p.bat!.SB, () => true), (p) => `${p.bat!.SB}도루`);
  add("다승왕", "🏅", leader(pitchers, (p) => p.pit!.W, () => true), (p) => `${p.pit!.W}승`);
  add("평균자책점왕", "🛡️", leader(pitchers, (p) => -era(p.pit!), (p) => p.pit!.IP >= 20),
    (p) => `ERA ${era(p.pit!).toFixed(2)}`);
  add("탈삼진왕", "⚡", leader(pitchers, (p) => p.pit!.SO, () => true), (p) => `${p.pit!.SO}탈삼진`);
  add("세이브왕", "🔒", leader(pitchers, (p) => p.pit!.SV, (p) => p.pit!.SV > 0), (p) => `${p.pit!.SV}세이브`);

  return out;
}
