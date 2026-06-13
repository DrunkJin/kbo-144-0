// ────────────────────────────────────────────────────────────────────────────
// 0–100 ratings for the UI (FIFA-style). Player OVR is era-adjusted (vs his own
// league); team offense/defense come from the run estimator. These are display
// scalings of the same sabermetric values the sim uses — no separate model.
// ────────────────────────────────────────────────────────────────────────────

import type { Player, Team } from "../types.ts";
import {
  wOBA, fip, expectedRunsScored, expectedRunsAllowed, teamStrength,
  DEFAULT_LEAGUE, type LeagueLookup,
} from "./runEstimator.ts";

const clamp100 = (x: number) => Math.max(1, Math.min(99, Math.round(x)));
// Player OVR floored higher than 1 so weak regulars still read as a believable
// rating rather than "짜친" single digits.
const clampOVR = (x: number) => Math.max(40, Math.min(99, Math.round(x)));
const PITCHER = ["SP", "RP", "CL"];

// FIFA-ish scale: league-average ≈ BASE, stars ~80s, all-time seasons ~95+.
const BASE = 66;
const BAT_SCALE = 235;
const PIT_SCALE = 12;
// Bayesian shrinkage so small-sample rates regress to the mean (a 30-PA hot
// streak shouldn't read 99). K = the PA/IP at which a player is weighted 50/50.
const K_PA = 200;
const K_IP = 40;

function own(table: LeagueLookup | undefined, season: number) {
  return table?.[season] ?? DEFAULT_LEAGUE;
}

/** Batter overall, sample-size-regressed and era-adjusted. ≈BASE = avg. */
export function batterOVR(p: Player, table?: LeagueLookup): number {
  if (!p.bat || p.bat.PA <= 0) return 40;
  const lg = own(table, p.season);
  // shrink wOBA toward league average by plate appearances
  const wEff = (wOBA(p.bat) * p.bat.PA + lg.wOBA * K_PA) / (p.bat.PA + K_PA);
  const adj = (wEff - lg.wOBA) / lg.wOBAScale; // runs/PA above league
  return clampOVR(BASE + adj * BAT_SCALE);
}

/** Pitcher overall, sample-size-regressed and era-adjusted. */
export function pitcherOVR(p: Player, table?: LeagueLookup): number {
  if (!p.pit || p.pit.IP <= 0) return 40;
  const lg = own(table, p.season);
  const better = lg.era - fip(p.pit, lg.fipConstant); // runs/9 below league
  const betterEff = better * (p.pit.IP / (p.pit.IP + K_IP)); // shrink by innings
  return clampOVR(BASE + betterEff * PIT_SCALE);
}

export function playerOVR(p: Player, table?: LeagueLookup): number {
  return PITCHER.includes(p.primaryPos) || (!p.bat && !!p.pit)
    ? pitcherOVR(p, table)
    : batterOVR(p, table);
}

export interface TeamRatings {
  offense: number;
  defense: number;
  overall: number;
}

/** Live team ratings from the (possibly partial) roster. */
export function teamRatings(team: Team, table?: LeagueLookup): TeamRatings {
  const rs = expectedRunsScored(team.lineup, DEFAULT_LEAGUE, table);
  const ra = expectedRunsAllowed(team.rotation, team.bullpen, DEFAULT_LEAGUE, table);
  const offense = clamp100(50 + (rs - 4.5) * 14);
  const defense = clamp100(50 + (4.5 - ra) * 14);
  const overall = team.lineup.length || team.rotation.length
    ? clamp100(teamStrength(team, DEFAULT_LEAGUE, table).pythagWinPct * 100)
    : 50;
  return { offense, defense, overall };
}
