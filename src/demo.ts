// ────────────────────────────────────────────────────────────────────────────
// End-to-end demo: spin the wheel, auto-draft a roster, simulate a 144-game
// season vs the league, print the result. Run: `npm run demo`.
// (Uses SAMPLE data — numbers are illustrative. See data/sample/sampleData.ts.)
// ────────────────────────────────────────────────────────────────────────────

import { FORMAT_SIMPLE, type Player, type Position } from "./types.ts";
import { wOBA, fip } from "./sim/runEstimator.ts";
import { simulateSeason } from "./sim/season.ts";
import {
  newDraft, placePlayer, draftToTeam, spinWheel, isComplete,
} from "./draft/draft.ts";
import { mulberry32 } from "./sim/rng.ts";
import { SAMPLE_WHEEL, buildLeagueOpponents } from "../data/sample/sampleData.ts";

const PITCHER_POS: Position[] = ["SP", "RP", "CL"];

function score(p: Player, pos: Position): number {
  if (PITCHER_POS.includes(pos)) return p.pit ? -fip(p.pit) : -99;
  return p.bat ? wOBA(p.bat) : -99;
}

function line(title: string) {
  console.log("\n" + title);
  console.log("─".repeat(title.length));
}

// ── 1. Demonstrate the wheel ────────────────────────────────────────────────
line("🎡  Wheel spins");
const rng = mulberry32(12345);
for (let i = 0; i < 5; i++) {
  const seg = spinWheel(SAMPLE_WHEEL, rng);
  console.log(`  spin ${i + 1}: ${seg.season} ${seg.team}  (${seg.players.length} draftable)`);
}

// ── 2. Auto-draft a Simple (15) roster from the full sample pool ─────────────
line("📋  Auto-drafting (Simple 15)");
const pool = SAMPLE_WHEEL.flatMap((s) => s.players);
let draft = newDraft(FORMAT_SIMPLE);
const used = new Set<string>();

for (const slot of FORMAT_SIMPLE.slots) {
  const candidates = pool
    .filter((p) => !used.has(p.id) && p.eligiblePos.includes(slot.pos))
    .sort((a, b) => score(b, slot.pos) - score(a, slot.pos));
  const pick = candidates[0];
  if (!pick) {
    console.log(`  ⚠️  no candidate for ${slot.key} (${slot.pos}) — sample pool too small`);
    continue;
  }
  used.add(pick.id);
  draft = placePlayer(draft, pick, slot.key);
  console.log(`  ${slot.key.padEnd(4)} → ${pick.name} (${pick.season} ${pick.team})`);
}

console.log(`\n  roster complete: ${isComplete(draft)}`);

// ── 3. Simulate the season ──────────────────────────────────────────────────
line("⚾  Simulating 144 games vs the 2017 league");
const myTeam = draftToTeam(draft, "My Dream Team");
const opponents = buildLeagueOpponents();
const result = simulateSeason(myTeam, opponents, { totalGames: 144, seed: 770 });

console.log(`  RS/game: ${result.myRsPerGame.toFixed(2)}   RA/game: ${result.myRaPerGame.toFixed(2)}`);
console.log(`  pythag win%: ${(result.myPythagWinPct * 100).toFixed(1)}%`);
console.log(`\n  ★ FINAL RECORD: ${result.wins}-${result.losses}  (${(result.winPct * 100).toFixed(1)}%)`);
console.log(`  Perfect 144-0 season: ${result.perfect ? "YES! 🏆" : "no"}`);

line("  vs each opponent");
for (const o of result.vs) {
  console.log(`  ${o.name.padEnd(6)} ${o.wins}-${o.losses}   (p=${(o.winProbPerGame * 100).toFixed(1)}%/game)`);
}
