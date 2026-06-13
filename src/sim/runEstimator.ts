// ────────────────────────────────────────────────────────────────────────────
// Level-1 run estimation (sabermetric, transparent, fast) — ERA-ADJUSTED.
//
//   Offense:  each hitter's wOBA is measured vs HIS OWN season's league wOBA
//             (era-relative runs/PA), then dropped into the TARGET year's run
//             environment.  -> RS/game
//   Defense:  each pitcher's FIP is measured vs HIS OWN season's league ERA,
//             then translated into the TARGET year's ERA level.  -> RA/game
//
// Per-season league constants come from buildLeagueTable() (leagueTable.ts),
// computed from the real data. Without a table, everything falls back to
// DEFAULT_LEAGUE and behaves era-neutral. See DESIGN.md §4 / §9.
// ────────────────────────────────────────────────────────────────────────────

import type { BatLine, PitLine, Player, Team } from "../types.ts";

export interface LeagueConstants {
  wOBA: number; // league average wOBA (offense yardstick)
  wOBAScale: number; // runs<->wOBA scale
  rPA: number; // league runs per PA (~0.118 ≈ 4.5 R/G over 38 PA)
  paPerGame: number; // team PA per game (~38)
  fipConstant: number; // makes league-avg FIP == league ERA that season
  era: number; // league ERA (pitching yardstick)
  obp: number; // league on-base % (for leadoff/role fit)
  iso: number; // league isolated power SLG-AVG (for cleanup/role fit)
  avg: number; // league batting average (for contact-role fit)
}

export const DEFAULT_LEAGUE: LeagueConstants = {
  wOBA: 0.32,
  wOBAScale: 1.15,
  rPA: 0.118,
  paPerGame: 38,
  fipConstant: 3.1,
  era: 4.2,
  obp: 0.34,
  iso: 0.13,
  avg: 0.265,
};

export type LeagueLookup = Record<number, LeagueConstants>;

/** Constants for a player's own season; fall back to the target environment. */
function own(table: LeagueLookup | undefined, season: number, target: LeagueConstants): LeagueConstants {
  return table?.[season] ?? target;
}

// wOBA linear weights (per event).
const W = { BB: 0.69, HBP: 0.72, b1: 0.89, b2: 1.27, b3: 1.62, HR: 2.1 };

// Weight per batting-order slot (1→9). Exaggerated beyond real PA splits so
// lineup ORDER is a meaningful lever — stacking your best bats up top noticeably
// raises run production.
const BAT_PA = [6.2, 5.1, 4.2, 3.5, 2.9, 2.4, 1.9, 1.4, 0.9];
// Relative weight by rotation slot (ace → #5). Ace-heavy so ordering the
// rotation matters: your best arm carries far more of the load.
const ROT_W = [1.8, 1.35, 1.0, 0.65, 0.35];

function singles(b: BatLine): number {
  return b.H - b.d2B - b.d3B - b.HR;
}

/** wOBA for one batting line. Denominator approximated by PA. */
export function wOBA(b: BatLine): number {
  if (b.PA <= 0) return 0;
  const num =
    W.BB * b.BB +
    W.HBP * b.HBP +
    W.b1 * singles(b) +
    W.b2 * b.d2B +
    W.b3 * b.d3B +
    W.HR * b.HR;
  return num / b.PA;
}

/** On-base %. */
export function OBP(b: BatLine): number {
  return b.PA > 0 ? (b.H + b.BB + b.HBP) / b.PA : 0;
}
/** Isolated power (SLG − AVG): extra bases per at-bat. */
export function ISO(b: BatLine): number {
  return b.AB > 0 ? (b.d2B + 2 * b.d3B + 3 * b.HR) / b.AB : 0;
}
/** Batting average. */
export function AVG(b: BatLine): number {
  return b.AB > 0 ? b.H / b.AB : 0;
}

// ── Batting-order ROLE fit ───────────────────────────────────────────────────
// Each slot's ideal skill shape, per canonical lineup theory:
//   1: 최고 출루 + 주루          2: 작전·정확도 + 출루 (1번과 유사)
//   3: 팀 최고 타율 + 주루       4: 가장 신뢰 + 장타
//   5: 찬스 강함 + 장타          6: 클린업 받침, 한방
//   7: 해결사 (찬스 의외로 많음)  8: 수비형(공격 기대 ↓, 주로 포수)
//   9: 하위타선 1번 — 출루 + 주루
// "찬스/해결사"는 기록으로 직접 안 잡혀 장타+정확도(득점 생산력)로 프록시.
// 4개 차원: ob(출루) avg(정확도) pw(장타) sp(주루). 각 차원은 9슬롯 평균을
// 빼서 CENTER → 절대 실력이 아니라 슬롯 수요와의 '형태 매칭'만 점수화.
const ROLE_RAW = {
  //     1     2     3     4     5     6     7     8     9
  ob: [1.5, 1.4, 1.1, 1.0, 0.9, 0.8, 0.8, 0.6, 1.3],
  avg: [0.8, 1.1, 1.5, 1.0, 0.9, 0.8, 0.9, 0.6, 0.9],
  pw: [0.3, 0.4, 0.9, 1.5, 1.4, 1.2, 1.0, 0.5, 0.4],
  sp: [1.4, 1.0, 0.9, 0.2, 0.2, 0.3, 0.4, 0.4, 1.3],
};
function center(a: number[]): number[] {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return a.map((v) => v - m);
}
const ROLE = {
  ob: center(ROLE_RAW.ob), avg: center(ROLE_RAW.avg),
  pw: center(ROLE_RAW.pw), sp: center(ROLE_RAW.sp),
};
const PLACE_K = 0.05; // strength of the role-fit lever (runs/PA scale)

/** FIP for one pitching line, scaled by the given (season-specific) constant. */
export function fip(p: PitLine, fipConstant: number = DEFAULT_LEAGUE.fipConstant): number {
  if (p.IP <= 0) return 6.0;
  return (13 * p.HR + 3 * (p.BB + p.HBP) - 2 * p.SO) / p.IP + fipConstant;
}

/**
 * Expected runs/game for a lineup, era-adjusted.
 * Each hitter contributes runs-above-average-per-PA measured in his own era;
 * the league baseline (rPA) comes from the target year.
 */
export function expectedRunsScored(
  lineup: Player[],
  target: LeagueConstants = DEFAULT_LEAGUE,
  table?: LeagueLookup,
): number {
  const hitters = lineup.filter((p) => p.bat && p.bat.PA > 0);
  if (hitters.length === 0) return target.rPA * target.paPerGame;

  // Weight by batting-order slot (not raw PA), so lineup order matters.
  let wxpa = 0;
  let wsum = 0;
  let place = 0; // role-fit bonus accumulator
  hitters.forEach((p, i) => {
    const b = p.bat!;
    const lg = own(table, p.season, target);
    const wraaPerPA = (wOBA(b) - lg.wOBA) / lg.wOBAScale; // era-relative runs/PA
    const w = BAT_PA[Math.min(i, BAT_PA.length - 1)];
    wxpa += wraaPerPA * w;
    wsum += w;

    // role fit: how well this player's skill SHAPE matches his slot's needs
    if (i < 9) {
      const obpN = (OBP(b) - lg.obp) / 0.05; // 출루 lean
      const avgN = (AVG(b) - lg.avg) / 0.035; // 정확도 lean
      const isoN = (ISO(b) - lg.iso) / 0.06; // 장타 lean
      const spdN = (b.SB / b.PA - 0.02) / 0.03; // 주루 lean
      place += ROLE.ob[i] * obpN + ROLE.avg[i] * avgN + ROLE.pw[i] * isoN + ROLE.sp[i] * spdN;
    }
  });
  const placementBonus = (PLACE_K * place) / 9; // runs/PA from good role placement

  // Diminishing returns: a lineup of nine all-time-great seasons would, under a
  // purely linear model, "score" ~10 runs/game — beyond anything real. tanh
  // saturates the extremes so elite lineups top out near a believable ceiling
  // while average lineups are essentially unchanged.
  const teamWraaPerPA = wxpa / wsum + placementBonus;
  const OFF_SCALE = 0.12;
  const eff = OFF_SCALE * Math.tanh(teamWraaPerPA / OFF_SCALE);
  const runsPerPA = target.rPA + eff;
  return Math.max(0.5, runsPerPA * target.paPerGame);
}

/**
 * Expected runs allowed/game from the staff, era-adjusted.
 * Each pitcher's own-era FIP is translated to the target year's ERA level,
 * then innings-weighted (rotation ~5.5ip, bullpen ~3.5ip of a 9-inning game).
 */
export function expectedRunsAllowed(
  rotation: Player[],
  bullpen: Player[],
  target: LeagueConstants = DEFAULT_LEAGUE,
  table?: LeagueLookup,
): number {
  const SP_IP = 5.5;
  const BP_IP = 3.5;

  const effFip = (p: Player): number => {
    const lg = own(table, p.season, target);
    const ownFip = fip(p.pit!, lg.fipConstant); // FIP in his own run environment
    return target.era + (ownFip - lg.era); // translate to target environment
  };
  const rot = rotation.filter((p) => p.pit && p.pit.IP > 0);
  const bp = bullpen.filter((p) => p.pit && p.pit.IP > 0);
  const replacement = target.era + 1.0; // mop-up / replacement-level arm

  // Rotation weighted by slot (ace throws more); thin rotations get replacement
  // innings (you can't run a season on 2 starters).
  let rnum = 0;
  let rw = 0;
  for (let i = 0; i < 5; i++) {
    const w = ROT_W[Math.min(i, ROT_W.length - 1)];
    rnum += (rot[i] ? effFip(rot[i]) : replacement) * w;
    rw += w;
  }
  const rotFip = rnum / rw;

  // Bullpen depth matters: ~4 arms needed to cover the relief innings. A lone
  // elite closer can't pitch all 3.5 relief innings every night — the rest is
  // replacement level. (Fixes the Simple-roster "1 closer" exploit.)
  const NEEDED_RP = 4;
  const bpQuality = bp.length ? bp.reduce((s, p) => s + effFip(p), 0) / bp.length : replacement;
  const coverage = Math.min(1, bp.length / NEEDED_RP);
  const bpFip = bpQuality * coverage + replacement * (1 - coverage);

  // Diminishing returns on run prevention, mirroring the offense ceiling.
  const raw = (rotFip * SP_IP + bpFip * BP_IP) / (SP_IP + BP_IP);
  const DEF_SCALE = 1.6;
  const margin = target.era - raw; // runs/9 below league
  const ra = target.era - DEF_SCALE * Math.tanh(margin / DEF_SCALE);
  return Math.max(0.5, ra);
}

export interface TeamStrength {
  rsPerGame: number; // runs scored / game
  raPerGame: number; // runs allowed / game
  pythagWinPct: number; // expected win% vs a league-average team
}

/** Pythagenpat exponent — adapts to run environment. */
function pythagExp(rs: number, ra: number): number {
  const rpg = (rs + ra) / 2;
  return Math.pow(Math.max(rpg, 0.1), 0.287);
}

export function teamStrength(
  team: Team,
  target: LeagueConstants = DEFAULT_LEAGUE,
  table?: LeagueLookup,
): TeamStrength {
  const rs = expectedRunsScored(team.lineup, target, table);
  const ra = expectedRunsAllowed(team.rotation, team.bullpen, target, table);
  const e = pythagExp(rs, ra);
  const win = Math.pow(rs, e) / (Math.pow(rs, e) + Math.pow(ra, e));
  return { rsPerGame: rs, raPerGame: ra, pythagWinPct: win };
}
