import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Player } from "../src/types.ts";
import { wOBA, fip } from "../src/sim/runEstimator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const players: Player[] = JSON.parse(readFileSync(join(root, "data/players.json"), "utf8"));
const bat = players.filter((p) => p.bat && p.bat.PA >= 400);
const pit = players.filter((p) => p.pit && p.pit.IP >= 100);

console.log("=== Top 8 batter-seasons by wOBA (min 400 PA) ===");
bat.map((p) => ({ p, w: wOBA(p.bat!) })).sort((a, b) => b.w - a.w).slice(0, 8)
  .forEach(({ p, w }) => console.log(`  ${w.toFixed(3)}  ${p.season} ${p.team} ${p.name} (${p.primaryPos}, ${p.bat!.HR}HR, WAR ${p.war})`));

console.log("\n=== Top 8 pitcher-seasons by FIP (min 100 IP) ===");
pit.map((p) => ({ p, f: fip(p.pit!) })).sort((a, b) => a.f - b.f).slice(0, 8)
  .forEach(({ p, f }) => console.log(`  ${f.toFixed(2)}  ${p.season} ${p.team} ${p.name} (${p.pit!.IP.toFixed(1)}ip, ${p.pit!.SO}K, WAR ${p.war})`));

const posCount: Record<string, number> = {};
for (const p of players) for (const pos of p.eligiblePos) posCount[pos] = (posCount[pos] || 0) + 1;
console.log("\n=== eligible-position distribution ===\n ", posCount);
