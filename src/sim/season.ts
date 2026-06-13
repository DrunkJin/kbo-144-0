// ────────────────────────────────────────────────────────────────────────────
// Season simulation.
//
// Your team plays every opponent (that year's other clubs) an equal number of
// games to fill out the schedule (KBO 144 = 10 teams x 16 games). Each game is
// a Bernoulli trial whose win prob comes from log5 of the two teams' pythag
// win%. Bernoulli (not just expected wins) is what makes "144-0" a real,
// variance-driven chase rather than a deterministic number.
// ────────────────────────────────────────────────────────────────────────────

import type { Team } from "../types.ts";
import {
  teamStrength, type TeamStrength, type LeagueConstants, type LeagueLookup, DEFAULT_LEAGUE,
} from "./runEstimator.ts";
import { mulberry32 } from "./rng.ts";

/** log5: prob A beats B given each team's win% vs a league-average team. */
export function log5(a: number, b: number): number {
  const denom = a + b - 2 * a * b;
  if (denom <= 0) return 0.5;
  return (a - a * b) / denom;
}

export interface OpponentResult {
  name: string;
  wins: number;
  losses: number;
  winProbPerGame: number;
}

export interface SeasonResult {
  wins: number;
  losses: number;
  games: number;
  winPct: number;
  perfect: boolean;
  myRsPerGame: number;
  myRaPerGame: number;
  myPythagWinPct: number;
  vs: OpponentResult[];
}

export interface SimOptions {
  totalGames?: number; // default 144
  seed?: number; // default fixed for reproducibility
  lg?: LeagueConstants; // target run environment (e.g. the opponent year's constants)
  table?: LeagueLookup; // per-season constants for era adjustment
  oppBoost?: number; // difficulty dial: raises opponent strength (0–~0.3)
}

export function simulateSeason(
  myTeam: Team,
  opponents: Team[],
  opts: SimOptions = {},
): SeasonResult {
  const totalGames = opts.totalGames ?? 144;
  const lg = opts.lg ?? DEFAULT_LEAGUE;
  const rand = mulberry32(opts.seed ?? 144000);

  const table = opts.table;
  const me = teamStrength(myTeam, lg, table);
  if (opponents.length === 0) {
    throw new Error("Need at least one opponent team to simulate a season.");
  }

  const gamesPer = Math.max(1, Math.round(totalGames / opponents.length));

  let wins = 0;
  let losses = 0;
  const vs: OpponentResult[] = [];

  for (const opp of opponents) {
    const oppStrength = teamStrength(opp, lg, table);
    const p = log5(me.pythagWinPct, oppStrength.pythagWinPct);
    let w = 0;
    let l = 0;
    for (let g = 0; g < gamesPer; g++) {
      if (rand() < p) w++;
      else l++;
    }
    wins += w;
    losses += l;
    vs.push({ name: opp.name, wins: w, losses: l, winProbPerGame: p });
  }

  const games = wins + losses;
  return {
    wins,
    losses,
    games,
    winPct: games ? wins / games : 0,
    perfect: losses === 0,
    myRsPerGame: me.rsPerGame,
    myRaPerGame: me.raPerGame,
    myPythagWinPct: me.pythagWinPct,
    vs,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Full-league standings + manager-mode primitives.
// ────────────────────────────────────────────────────────────────────────────

export interface TeamRecord {
  name: string;
  wins: number;
  losses: number;
  winPct: number;
  isMe: boolean;
}

export interface LeagueResult extends SeasonResult {
  standings: TeamRecord[]; // every club, sorted
  myRank: number; // 1-based
  gamesPerPair: number; // games vs each opponent
}

export interface OppProb {
  name: string;
  pythag: number;
  prob: number; // my win prob per game vs this opponent
}

export const MY_TEAM_NAME = "내 드림팀";

/** Games played against each opponent so every club totals ~totalGames. */
export function leagueGamesPerPair(numOpponents: number, totalGames = 144): number {
  return Math.max(1, Math.round(totalGames / Math.max(1, numOpponents)));
}

/**
 * My pythag strength + per-opponent win probabilities.
 * `oppBoost` (0–~0.3) raises every opponent's strength — the difficulty dial.
 * The boost applies to the stored pythag too, so opponents are uniformly
 * tougher both against me AND in their own round-robin (a real elite league).
 */
export function teamProbs(
  myTeam: Team,
  opponents: Team[],
  lg: LeagueConstants = DEFAULT_LEAGUE,
  table?: LeagueLookup,
  oppBoost = 0,
): { me: TeamStrength; opps: OppProb[] } {
  const me = teamStrength(myTeam, lg, table);
  const opps = opponents.map((o) => {
    const s = teamStrength(o, lg, table);
    const pythag = Math.min(0.92, s.pythagWinPct + oppBoost);
    return { name: o.name, pythag, prob: log5(me.pythagWinPct, pythag) };
  });
  return { me, opps };
}

/** Bernoulli a series of `games` at win prob `prob`. */
export function simSeries(prob: number, games: number, rng: () => number): { wins: number; losses: number } {
  const p = Math.min(0.999, Math.max(0.001, prob));
  let wins = 0;
  let losses = 0;
  for (let i = 0; i < games; i++) {
    if (rng() < p) wins++;
    else losses++;
  }
  return { wins, losses };
}

/** Round-robin among the opponents themselves (excludes games vs me). */
export function simulateOpponentRoundRobin(
  opps: OppProb[],
  gamesPerPair: number,
  rng: () => number,
): Map<string, { wins: number; losses: number }> {
  const rec = new Map<string, { wins: number; losses: number }>();
  opps.forEach((o) => rec.set(o.name, { wins: 0, losses: 0 }));
  for (let i = 0; i < opps.length; i++) {
    for (let j = i + 1; j < opps.length; j++) {
      const p = log5(opps[i].pythag, opps[j].pythag);
      for (let g = 0; g < gamesPerPair; g++) {
        const a = rec.get(opps[i].name)!;
        const b = rec.get(opps[j].name)!;
        if (rng() < p) { a.wins++; b.losses++; }
        else { a.losses++; b.wins++; }
      }
    }
  }
  return rec;
}

/** Combine my per-opponent record with the opponent round-robin into standings. */
export function buildStandings(
  myVs: OpponentResult[],
  oppRR: Map<string, { wins: number; losses: number }>,
  myName = MY_TEAM_NAME,
): { standings: TeamRecord[]; myRank: number } {
  const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0);
  const myW = myVs.reduce((s, v) => s + v.wins, 0);
  const myL = myVs.reduce((s, v) => s + v.losses, 0);

  const standings: TeamRecord[] = [
    { name: myName, wins: myW, losses: myL, winPct: pct(myW, myL), isMe: true },
  ];
  for (const v of myVs) {
    const rr = oppRR.get(v.name) ?? { wins: 0, losses: 0 };
    const w = rr.wins + v.losses; // opp's wins vs me = my losses
    const l = rr.losses + v.wins;
    standings.push({ name: v.name, wins: w, losses: l, winPct: pct(w, l), isMe: false });
  }
  standings.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
  return { standings, myRank: standings.findIndex((r) => r.isMe) + 1 };
}

/** Instant full-league simulation: my games + opponent round-robin → standings. */
export function simulateLeague(myTeam: Team, opponents: Team[], opts: SimOptions = {}): LeagueResult {
  const totalGames = opts.totalGames ?? 144;
  const lg = opts.lg ?? DEFAULT_LEAGUE;
  const table = opts.table;
  if (opponents.length === 0) throw new Error("Need at least one opponent team.");
  const rng = mulberry32(opts.seed ?? 144000);

  const { me, opps } = teamProbs(myTeam, opponents, lg, table, opts.oppBoost ?? 0);
  const gamesPerPair = leagueGamesPerPair(opponents.length, totalGames);

  const vs: OpponentResult[] = opps.map((o) => {
    const r = simSeries(o.prob, gamesPerPair, rng);
    return { name: o.name, wins: r.wins, losses: r.losses, winProbPerGame: o.prob };
  });
  const oppRR = simulateOpponentRoundRobin(opps, gamesPerPair, rng);
  const { standings, myRank } = buildStandings(vs, oppRR);

  const wins = vs.reduce((s, v) => s + v.wins, 0);
  const losses = vs.reduce((s, v) => s + v.losses, 0);
  const games = wins + losses;
  return {
    wins, losses, games,
    winPct: games ? wins / games : 0,
    perfect: losses === 0,
    myRsPerGame: me.rsPerGame,
    myRaPerGame: me.raPerGame,
    myPythagWinPct: me.pythagWinPct,
    vs, standings, myRank, gamesPerPair,
  };
}
