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
}

export const DEFAULT_LEAGUE: LeagueConstants = {
  wOBA: 0.32,
  wOBAScale: 1.15,
  rPA: 0.118,
  paPerGame: 38,
  fipConstant: 3.1,
  era: 4.2,
};

export type LeagueLookup = Record<number, LeagueConstants>;

/** Constants for a player's own season; fall back to the target environment. */
function own(table: LeagueLookup | undefined, season: number, target: LeagueConstants): LeagueConstants {
  return table?.[season] ?? target;
}

// wOBA linear weights (per event).
const W = { BB: 0.69, HBP: 0.72, b1: 0.89, b2: 1.27, b3: 1.62, HR: 2.1 };

// Plate appearances per batting-order slot (1→9). Top of the order bats more,
// so lineup ORDER matters — put your best hitters up top.
const BAT_PA = [4.65, 4.55, 4.45, 4.35, 4.25, 4.15, 4.05, 3.95, 3.85];
// Relative innings by rotation slot (ace → #5). Order your rotation: the ace
// (slot 1) throws the most innings over a season.
const ROT_W = [1.18, 1.08, 1.0, 0.92, 0.82];

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
  hitters.forEach((p, i) => {
    const b = p.bat!;
    const lg = own(table, p.season, target);
    const wraaPerPA = (wOBA(b) - lg.wOBA) / lg.wOBAScale; // era-relative runs/PA
    const w = BAT_PA[Math.min(i, BAT_PA.length - 1)];
    wxpa += wraaPerPA * w;
    wsum += w;
  });
  const teamWraaPerPA = wxpa / wsum;
  const runsPerPA = target.rPA + teamWraaPerPA;
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

  // Rotation weighted by slot (ace throws more); bullpen weighted evenly.
  let rnum = 0;
  let rw = 0;
  rot.forEach((p, i) => {
    const w = ROT_W[Math.min(i, ROT_W.length - 1)];
    rnum += effFip(p) * w;
    rw += w;
  });
  const rotFip = rw ? rnum / rw : target.era;
  const bpFip = bp.length ? bp.reduce((s, p) => s + effFip(p), 0) / bp.length : target.era;

  const ra = (rotFip * SP_IP + bpFip * BP_IP) / (SP_IP + BP_IP);
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
