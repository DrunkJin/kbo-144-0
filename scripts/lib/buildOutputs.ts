// Shared output builder: turns a normalized Player[] into the full dataset +
// the web-served chunks (index / league-table / per-season / prime). Used by
// both the Kaggle ingest and the KBO crawler so the format never drifts.

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Player } from "../../src/types.ts";
import { buildLeagueTable } from "../../src/sim/leagueTable.ts";
import { buildPrimeIndex } from "../../src/data/load.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");

export function buildOutputs(players: Player[]): void {
  const dataFile = join(ROOT, "data/players.json");
  const pub = join(ROOT, "public/data");

  mkdirSync(dirname(dataFile), { recursive: true });
  writeFileSync(dataFile, JSON.stringify(players, null, 0));

  const seasonsDir = join(pub, "seasons");
  rmSync(seasonsDir, { recursive: true, force: true });
  mkdirSync(seasonsDir, { recursive: true });

  const bySeason = new Map<number, Player[]>();
  for (const p of players) {
    const arr = bySeason.get(p.season) ?? [];
    arr.push(p);
    bySeason.set(p.season, arr);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  for (const [year, arr] of bySeason) {
    writeFileSync(join(seasonsDir, `${year}.json`), JSON.stringify(arr, null, 0));
  }

  writeFileSync(join(pub, "index.json"), JSON.stringify({
    seasons, minSeason: seasons[0], maxSeason: seasons[seasons.length - 1],
    totalPlayers: players.length,
  }));
  writeFileSync(join(pub, "league-table.json"), JSON.stringify(buildLeagueTable(players)));

  const prime = buildPrimeIndex(players);
  const primeObj: Record<string, unknown> = {};
  for (const [k, p] of prime) {
    primeObj[k] = { season: p.season, bat: p.bat, pit: p.pit, war: p.war, rarity: p.rarity };
  }
  writeFileSync(join(pub, "prime.json"), JSON.stringify(primeObj));

  console.log(`✅  ${players.length} player-seasons → data/players.json + ${seasons.length} season chunks (${seasons[0]}~${seasons[seasons.length - 1]})`);
}

export const DATA_FILE = join(ROOT, "data/players.json");
