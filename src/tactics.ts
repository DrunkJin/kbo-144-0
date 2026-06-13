// In-season strategy tokens for 감독 모드 (manager mode). Each series you may
// spend one tactic to nudge that series' win probability — but some carry a
// cost into the NEXT series, so where you spend them matters.

export interface Tactic {
  id: string;
  icon: string;
  label: string;
  desc: string;
  thisDelta: number; // win-prob delta applied to this series
  nextDelta: number; // carryover delta applied to the next series
  uses: number; // total uses for the whole season
}

export const TACTICS: Tactic[] = [
  {
    id: "ace", icon: "🔥", label: "에이스 집중",
    desc: "이 시리즈 승률 +8%",
    thisDelta: 0.08, nextDelta: 0, uses: 3,
  },
  {
    id: "allout", icon: "🏃", label: "총력전",
    desc: "이 시리즈 +12% · 다음 시리즈 −6% (피로)",
    thisDelta: 0.12, nextDelta: -0.06, uses: 2,
  },
  {
    id: "rest", icon: "😴", label: "로테이션 휴식",
    desc: "이 시리즈 −5% · 다음 시리즈 +8% (재정비)",
    thisDelta: -0.05, nextDelta: 0.08, uses: 2,
  },
];

/** Uses scaled by difficulty (easy = more room to manage). */
export function tacticUsesFor(difficulty: "easy" | "normal" | "hard"): Record<string, number> {
  const mult = difficulty === "easy" ? 1.5 : difficulty === "hard" ? 0.5 : 1;
  const out: Record<string, number> = {};
  for (const t of TACTICS) out[t.id] = Math.max(1, Math.round(t.uses * mult));
  return out;
}
