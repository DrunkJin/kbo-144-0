// ────────────────────────────────────────────────────────────────────────────
// Per-season league constants, computed from the actual data. This is what
// makes cross-era drafting fair: a player is valued RELATIVE TO HIS OWN SEASON
// (wRC+/ERA+ style), then translated into the target (opponent) year's run
// environment for the simulation.
//
//   lgwOBA  — that season's PA-weighted league wOBA  (offense yardstick)
//   era     — that season's league ERA               (pitching yardstick)
//   rPA     — league runs per PA, derived from league ERA + unearned factor
//   fipConst— makes league-average FIP == league ERA that season
// ────────────────────────────────────────────────────────────────────────────

import type { Player } from "../types.ts";
import { wOBA, type LeagueConstants, DEFAULT_LEAGUE } from "./runEstimator.ts";

export type LeagueTable = Record<number, LeagueConstants>;

// League runs are ~8% higher than EARNED runs (unearned runs). Used to turn
// league ERA into a league runs-per-game scoring baseline.
const UNEARNED_FACTOR = 0.92;

function rawFipNumerator(p: NonNullable<Player["pit"]>): number {
  return 13 * p.HR + 3 * (p.BB + p.HBP) - 2 * p.SO;
}

export function buildLeagueTable(players: Player[]): LeagueTable {
  const bat = new Map<number, { wxpa: number; pa: number }>();
  const pit = new Map<number, { er: number; ip: number; rawfip: number }>();

  for (const p of players) {
    if (p.bat && p.bat.PA > 0) {
      const b = bat.get(p.season) ?? { wxpa: 0, pa: 0 };
      b.wxpa += wOBA(p.bat) * p.bat.PA;
      b.pa += p.bat.PA;
      bat.set(p.season, b);
    }
    if (p.pit && p.pit.IP > 0) {
      const q = pit.get(p.season) ?? { er: 0, ip: 0, rawfip: 0 };
      q.er += p.pit.ER;
      q.ip += p.pit.IP;
      q.rawfip += rawFipNumerator(p.pit);
      pit.set(p.season, q);
    }
  }

  const table: LeagueTable = {};
  const seasons = new Set([...bat.keys(), ...pit.keys()]);
  for (const year of seasons) {
    const b = bat.get(year);
    const q = pit.get(year);
    // Require a real sample, else fall back to defaults.
    if (!b || !q || b.pa < 1000 || q.ip < 500) {
      table[year] = { ...DEFAULT_LEAGUE };
      continue;
    }
    const lgwOBA = b.wxpa / b.pa;
    const era = (q.er * 9) / q.ip;
    const lgRawFip = q.rawfip / q.ip;
    const fipConstant = era - lgRawFip;
    const rPA = era / UNEARNED_FACTOR / DEFAULT_LEAGUE.paPerGame;

    table[year] = {
      wOBA: lgwOBA,
      wOBAScale: DEFAULT_LEAGUE.wOBAScale,
      rPA,
      paPerGame: DEFAULT_LEAGUE.paPerGame,
      fipConstant,
      era,
    };
  }
  return table;
}

/** Constants for a player's own season (fallback to target if unknown). */
export function ownLeague(table: LeagueTable | undefined, season: number, target: LeagueConstants): LeagueConstants {
  return table?.[season] ?? target;
}
