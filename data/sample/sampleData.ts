// ────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — illustrative only. Stat lines are approximate / hand-made to
// exercise the engine end-to-end. Real data comes from the Kaggle ingest
// (scripts/ingest-kaggle.ts). Do not treat these numbers as accurate.
// ────────────────────────────────────────────────────────────────────────────

import type { BatLine, PitLine, Player, Position } from "../../src/types.ts";
import type { WheelSegment } from "../../src/draft/draft.ts";

function bat(o: Partial<BatLine>): BatLine {
  return {
    PA: 0, AB: 0, H: 0, d2B: 0, d3B: 0, HR: 0, BB: 0, HBP: 0, SO: 0, SB: 0,
    ...o,
  };
}
function pit(o: Partial<PitLine>): PitLine {
  return {
    IP: 0, ER: 0, H: 0, HR: 0, BB: 0, HBP: 0, SO: 0, BF: 0, GS: 0, SV: 0,
    ...o,
  };
}

let n = 0;
function batter(
  name: string, team: string, season: number, pos: Position, line: BatLine,
  eligible: Position[] = [pos, "DH"],
): Player {
  return {
    id: `${season}-${team}-${name}-${n++}`,
    name, team, season, primaryPos: pos, eligiblePos: eligible, bat: line,
  };
}
function pitcher(
  name: string, team: string, season: number, pos: Position, line: PitLine,
): Player {
  return {
    id: `${season}-${team}-${name}-${n++}`,
    name, team, season, primaryPos: pos, eligiblePos: [pos], pit: line,
  };
}

// ── A few club-season wheel segments (illustrative star-studded squads) ──────
export const SAMPLE_WHEEL: WheelSegment[] = [
  {
    team: "KIA", season: 2017,
    players: [
      batter("최형우", "KIA", 2017, "LF", bat({ PA: 600, AB: 514, H: 176, d2B: 35, d3B: 1, HR: 26, BB: 96, HBP: 8, SO: 91 }), ["LF", "1B", "DH"]),
      batter("김선빈", "KIA", 2017, "SS", bat({ PA: 540, AB: 476, H: 176, d2B: 34, d3B: 1, HR: 5, BB: 45, HBP: 6, SO: 40 }), ["SS", "2B", "DH"]),
      batter("이명기", "KIA", 2017, "CF", bat({ PA: 470, AB: 430, H: 144, d2B: 27, d3B: 2, HR: 9, BB: 28, HBP: 7, SO: 55 }), ["CF", "RF", "DH"]),
      pitcher("헥터", "KIA", 2017, "SP", pit({ IP: 201.1, ER: 84, H: 200, HR: 18, BB: 47, HBP: 6, SO: 152, BF: 850, GS: 30 })),
      pitcher("양현종", "KIA", 2017, "SP", pit({ IP: 193.1, ER: 81, H: 188, HR: 20, BB: 49, HBP: 5, SO: 158, BF: 810, GS: 31 })),
    ],
  },
  {
    team: "두산", season: 2018,
    players: [
      batter("김재환", "두산", 2018, "RF", bat({ PA: 583, AB: 502, H: 169, d2B: 32, d3B: 0, HR: 44, BB: 71, HBP: 6, SO: 124 }), ["RF", "LF", "DH"]),
      batter("양의지", "두산", 2018, "C", bat({ PA: 470, AB: 401, H: 142, d2B: 25, d3B: 0, HR: 23, BB: 54, HBP: 8, SO: 50 }), ["C", "DH"]),
      batter("허경민", "두산", 2018, "3B", bat({ PA: 600, AB: 520, H: 159, d2B: 27, d3B: 3, HR: 8, BB: 60, HBP: 9, SO: 58 }), ["3B", "2B", "DH"]),
      batter("박건우", "두산", 2018, "CF", bat({ PA: 540, AB: 480, H: 156, d2B: 30, d3B: 2, HR: 12, BB: 44, HBP: 7, SO: 70 }), ["CF", "RF", "DH"]),
      pitcher("조쉬린드블럼", "두산", 2018, "SP", pit({ IP: 168.2, ER: 54, H: 150, HR: 17, BB: 40, HBP: 4, SO: 157, BF: 700, GS: 28 })),
    ],
  },
  {
    team: "삼성", season: 2011,
    players: [
      batter("최형우-11", "삼성", 2011, "LF", bat({ PA: 540, AB: 465, H: 154, d2B: 28, d3B: 1, HR: 30, BB: 65, HBP: 6, SO: 90 }), ["LF", "1B", "DH"]),
      batter("이승엽", "삼성", 2012, "1B", bat({ PA: 540, AB: 475, H: 146, d2B: 30, d3B: 1, HR: 21, BB: 56, HBP: 5, SO: 85 }), ["1B", "DH"]),
      pitcher("오승환", "삼성", 2011, "CL", pit({ IP: 57.0, ER: 9, H: 30, HR: 2, BB: 16, HBP: 2, SO: 70, BF: 220, GS: 0, SV: 47 })),
      pitcher("윤성환", "삼성", 2011, "SP", pit({ IP: 172.0, ER: 60, H: 165, HR: 14, BB: 38, HBP: 5, SO: 130, BF: 710, GS: 27 })),
      pitcher("배영수", "삼성", 2011, "SP", pit({ IP: 160.0, ER: 65, H: 160, HR: 13, BB: 45, HBP: 6, SO: 110, BF: 680, GS: 26 })),
      pitcher("안지만", "삼성", 2011, "RP", pit({ IP: 76.0, ER: 18, H: 65, HR: 5, BB: 20, HBP: 3, SO: 65, BF: 310, GS: 0, SV: 5 })),
      batter("정근우", "삼성", 2011, "2B", bat({ PA: 560, AB: 490, H: 150, d2B: 28, d3B: 4, HR: 9, BB: 55, HBP: 8, SO: 75 }), ["2B", "DH"]),
    ],
  },
];

// ── A synthetic "league" of opponent teams (that year's other clubs) ─────────
// Built from league-average-ish lines with small per-team noise. In the real
// game these come from the spun year's actual club rosters.
function avgBatter(team: string, pos: Position, mult: number): Player {
  return batter(team + "-h-" + pos, team, 2017, pos, bat({
    PA: 550, AB: 490, H: Math.round(135 * mult), d2B: Math.round(24 * mult),
    d3B: 2, HR: Math.round(15 * mult), BB: 45, HBP: 5, SO: 95,
  }));
}
function avgSP(team: string, mult: number): Player {
  return pitcher(team + "-sp", team, 2017, "SP", pit({
    IP: 170, ER: Math.round(80 / mult), H: 175, HR: 18, BB: 55, HBP: 6,
    SO: Math.round(120 * mult), BF: 740, GS: 30,
  }));
}
function avgRP(team: string, mult: number): Player {
  return pitcher(team + "-rp", team, 2017, "RP", pit({
    IP: 70, ER: Math.round(32 / mult), H: 70, HR: 7, BB: 28, HBP: 3,
    SO: Math.round(60 * mult), BF: 300, GS: 0,
  }));
}

import type { Team } from "../../src/types.ts";

export function buildLeagueOpponents(): Team[] {
  const names = ["NC", "LG", "롯데", "한화", "키움", "SSG", "KT", "두산", "삼성"];
  return names.map((name, i) => {
    const mult = 0.92 + (i % 5) * 0.04; // 0.92..1.08 strength spread
    const positions: Position[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
    return {
      name,
      season: 2017,
      lineup: positions.map((p) => avgBatter(name, p, mult)),
      rotation: [avgSP(name, mult), avgSP(name, mult), avgSP(name, mult), avgSP(name, mult), avgSP(name, mult)],
      bullpen: [avgRP(name, mult), avgRP(name, mult), avgRP(name, mult)],
    };
  });
}
