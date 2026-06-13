// ────────────────────────────────────────────────────────────────────────────
// Web data layer (CHUNKED). Startup loads only a tiny index + precomputed
// league table (~7KB). Player data is fetched per-season on demand, and the
// prime index only when Prime mode is used. See scripts/ingest-kaggle.ts.
// ────────────────────────────────────────────────────────────────────────────

import type { Player, Position, Team } from "../types.ts";
import type { WheelSegment } from "../draft/draft.ts";
import type { LeagueTable } from "../sim/leagueTable.ts";
import { wOBA, fip } from "../sim/runEstimator.ts";

export interface IndexMeta {
  seasons: number[];
  minSeason: number;
  maxSeason: number;
  totalPlayers: number;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

let _index: IndexMeta | null = null;
let _table: LeagueTable | null = null;
const _seasonCache = new Map<number, Player[]>();
let _prime: PrimeIndex | null = null;

/** Tiny startup payload: season list + precomputed era-adjustment constants. */
export async function loadMeta(): Promise<{ index: IndexMeta; table: LeagueTable }> {
  if (!_index) _index = await getJSON<IndexMeta>("/data/index.json");
  if (!_table) _table = await getJSON<LeagueTable>("/data/league-table.json");
  return { index: _index, table: _table };
}

/** Players for a single season (cached). */
export async function loadSeason(year: number): Promise<Player[]> {
  const hit = _seasonCache.get(year);
  if (hit) return hit;
  const arr = await getJSON<Player[]>(`/data/seasons/${year}.json`);
  _seasonCache.set(year, arr);
  return arr;
}

/** All players within a [min, max] year range (parallel chunk fetches). */
export async function loadSeasonRange(min: number, max: number, allSeasons: number[]): Promise<Player[]> {
  const years = allSeasons.filter((y) => y >= min && y <= max);
  const chunks = await Promise.all(years.map((y) => loadSeason(y)));
  return chunks.flat();
}

/** Career-best season per player, for Prime mode (lazy — only when needed). */
export async function loadPrimeIndex(): Promise<PrimeIndex> {
  if (_prime) return _prime;
  const obj = await getJSON<Record<string, Pick<Player, "season" | "bat" | "pit" | "war" | "rarity">>>("/data/prime.json");
  const map: PrimeIndex = new Map();
  for (const [k, v] of Object.entries(obj)) map.set(k, v as Player);
  _prime = map;
  return map;
}

/** Group players into club-season wheel segments (min size to be draftable). */
export function buildWheelSegments(players: Player[], minPlayers = 12): WheelSegment[] {
  const byKey = new Map<string, WheelSegment>();
  for (const p of players) {
    const key = `${p.season}|${p.team}`;
    let seg = byKey.get(key);
    if (!seg) {
      seg = { team: p.team, season: p.season, players: [] };
      byKey.set(key, seg);
    }
    seg.players.push(p);
  }
  return [...byKey.values()]
    .filter((s) => s.players.length >= minPlayers)
    .sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
}

export function listSeasons(players: Player[]): number[] {
  return [...new Set(players.map((p) => p.season))].sort((a, b) => a - b);
}

export function filterByYear(players: Player[], min: number, max: number): Player[] {
  return players.filter((p) => p.season >= min && p.season <= max);
}

// ── Prime mode: each player at their career-best season ──────────────────────
export type PrimeIndex = Map<string, Player>;

export function buildPrimeIndex(players: Player[]): PrimeIndex {
  const best: PrimeIndex = new Map();
  for (const p of players) {
    if (!p.pid) continue;
    const key = p.pid + (p.pit ? "P" : "B"); // separate batting/pitching identities
    const cur = best.get(key);
    if (!cur || (p.war ?? -99) > (cur.war ?? -99)) best.set(key, p);
  }
  return best;
}

/** Swap a player's stats for their career-best season, keeping the club-season
 *  context (team/season label) of the card you actually drew. */
export function resolvePrime(p: Player, index: PrimeIndex): Player {
  if (!p.pid) return p;
  const prime = index.get(p.pid + (p.pit ? "P" : "B"));
  if (!prime || prime.season === p.season) return p;
  return {
    ...p,
    bat: prime.bat, pit: prime.pit, war: prime.war, rarity: prime.rarity,
    primeSeason: prime.season,
  };
}

// Position scarcity order — fill scarce slots first so a versatile star isn't
// burned on an easy slot, leaving a scarce one empty.
const LINEUP_ORDER: Position[] = ["C", "SS", "CF", "2B", "3B", "RF", "LF", "1B", "DH"];

/** Assemble the strongest legal team out of a pool of players (for opponents). */
export function assembleBestTeam(pool: Player[], name: string, season?: number): Team {
  const batters = pool.filter((p) => p.bat && p.bat.PA >= 80);
  const pitchers = pool.filter((p) => p.pit && p.pit.IP >= 20);
  const used = new Set<string>();

  const lineup: Player[] = [];
  for (const pos of LINEUP_ORDER) {
    const pick = batters
      .filter((p) => !used.has(p.id) && p.eligiblePos.includes(pos))
      .sort((a, b) => wOBA(b.bat!) - wOBA(a.bat!))[0];
    if (pick) {
      used.add(pick.id);
      lineup.push(pick);
    }
  }

  // Bat the best hitters at the top (the order-aware sim rewards this).
  lineup.sort((a, b) => wOBA(b.bat!) - wOBA(a.bat!));

  const sp = pitchers
    .filter((p) => p.primaryPos === "SP")
    .sort((a, b) => fip(a.pit!) - fip(b.pit!));
  const rotation = sp.slice(0, 5);
  const rotIds = new Set(rotation.map((p) => p.id));

  const relievers = pitchers
    .filter((p) => (p.primaryPos === "RP" || p.primaryPos === "CL") && !rotIds.has(p.id))
    .sort((a, b) => fip(a.pit!) - fip(b.pit!));
  const bullpen = relievers.slice(0, 6);

  return { name, season, lineup, rotation, bullpen };
}

/** Build a given year's league (all its clubs) as opponent teams. */
export function buildLeagueForYear(players: Player[], year: number): Team[] {
  const teams = new Map<string, Player[]>();
  for (const p of players) {
    if (p.season !== year) continue;
    const arr = teams.get(p.team) ?? [];
    arr.push(p);
    teams.set(p.team, arr);
  }
  return [...teams.entries()]
    .map(([team, pool]) => assembleBestTeam(pool, team, year))
    .filter((t) => t.lineup.length >= 6); // skip too-thin rosters
}
