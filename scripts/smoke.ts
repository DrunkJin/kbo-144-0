import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Player } from "../src/types.ts";
import { buildLeagueForYear, assembleBestTeam } from "../src/data/load.ts";
import { simulateSeason } from "../src/sim/season.ts";
import { buildLeagueTable } from "../src/sim/leagueTable.ts";
import { wOBA } from "../src/sim/runEstimator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const players: Player[] = JSON.parse(readFileSync(join(root, "data/players.json"), "utf8"));
const table = buildLeagueTable(players);

console.log("=== Per-season league environment (era adjustment basis) ===");
for (const y of [1982, 1999, 2009, 2014, 2017, 2022, 2025]) {
  const c = table[y];
  if (c) console.log(`  ${y}: lgwOBA ${c.wOBA.toFixed(3)}  lgERA ${c.era.toFixed(2)}  rPA ${c.rPA.toFixed(3)}  (R/G ${(c.rPA * c.paPerGame).toFixed(2)})`);
}

console.log("\n=== Era adjustment in action: same raw wOBA, different eras ===");
// pull two real high-wOBA hitters from a hitter's era (2014) vs pitcher's era (2006)
const sample = (yr: number) =>
  players.filter((p) => p.season === yr && p.bat && p.bat.PA >= 400)
    .map((p) => ({ p, raw: wOBA(p.bat!) }))
    .sort((a, b) => b.raw - a.raw)[0];
for (const yr of [2006, 2014]) {
  const { p, raw } = sample(yr);
  const lg = table[yr];
  const adj = (raw - lg.wOBA) / lg.wOBAScale; // runs/PA above his league
  console.log(`  ${yr} ${p.name}: raw wOBA ${raw.toFixed(3)} | lg ${lg.wOBA.toFixed(3)} | era-adj +${adj.toFixed(3)} R/PA above league`);
}

console.log("\n=== 2017 KIA vs 2017 league: with vs without era adjustment ===");
const opponents = buildLeagueForYear(players, 2017).filter((t) => t.name !== "KIA");
const kia = assembleBestTeam(players.filter((p) => p.season === 2017 && p.team === "KIA"), "2017 KIA");
const noAdj = simulateSeason(kia, opponents, { totalGames: 144, seed: 42 });
const withAdj = simulateSeason(kia, opponents, { totalGames: 144, seed: 42, lg: table[2017], table });
console.log(`  no era adj : ${noAdj.wins}-${noAdj.losses}  RS ${noAdj.myRsPerGame.toFixed(2)} RA ${noAdj.myRaPerGame.toFixed(2)}`);
console.log(`  era-adjusted: ${withAdj.wins}-${withAdj.losses}  RS ${withAdj.myRsPerGame.toFixed(2)} RA ${withAdj.myRaPerGame.toFixed(2)}`);

console.log("\n=== Cross-era dream team (best hitters/pitchers across ALL years) vs 2017 ===");
const bestBat = players.filter((p) => p.bat && p.bat.PA >= 450)
  .sort((a, b) => wOBA(b.bat!) - wOBA(a.bat!));
const dream = assembleBestTeam([...bestBat.slice(0, 60), ...players.filter((p) => p.pit && p.pit.IP >= 100)], "올타임 드림팀");
const dreamRes = simulateSeason(dream, opponents, { totalGames: 144, seed: 7, lg: table[2017], table });
console.log(`  ${dreamRes.wins}-${dreamRes.losses} (${(dreamRes.winPct * 100).toFixed(1)}%)  RS ${dreamRes.myRsPerGame.toFixed(2)} RA ${dreamRes.myRaPerGame.toFixed(2)} pythag ${(dreamRes.myPythagWinPct * 100).toFixed(1)}%`);
console.log("  lineup:", dream.lineup.map((p) => `${p.name}(${p.season})`).join(", "));

console.log("\n=== Full league standings (simulateLeague), dream team vs 2017 ===");
import { simulateLeague } from "../src/sim/season.ts";
import { expectedRunsScored } from "../src/sim/runEstimator.ts";
const lg = simulateLeague(dream, opponents, { totalGames: 144, seed: 7, lg: table[2017], table });
console.log(`  내 순위: ${lg.myRank}위 / ${lg.standings.length}팀  (${lg.wins}-${lg.losses})`);
lg.standings.slice(0, 5).forEach((t, i) => console.log(`  ${i + 1}. ${t.name}${t.isMe ? " ★" : ""}  ${t.wins}-${t.losses}`));

console.log("\n=== Batting-order sensitivity (same 9 hitters, best-first vs worst-first) ===");
const nine = dream.lineup.slice(0, 9);
const rsBest = expectedRunsScored([...nine], table[2017], table);
const rsWorst = expectedRunsScored([...nine].reverse(), table[2017], table);
console.log(`  best-first RS/G ${rsBest.toFixed(3)}  vs  reversed RS/G ${rsWorst.toFixed(3)}  → 차이 ${(rsBest - rsWorst).toFixed(3)}`);
