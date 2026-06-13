// ────────────────────────────────────────────────────────────────────────────
// Draft mechanics: spin the wheel (club + season) -> pick a player -> place in a
// slot. Handles position eligibility and tracks which slots remain open.
// ────────────────────────────────────────────────────────────────────────────

import type { Player, Position, RosterFormat, RosterSlot, Team } from "../types.ts";

export interface WheelSegment {
  team: string;
  season: number;
  players: Player[]; // that club-season's draftable roster
}

export interface DraftState {
  format: RosterFormat;
  filled: Record<string, Player | null>; // slot.key -> player
  picks: Player[];
}

export function newDraft(format: RosterFormat): DraftState {
  const filled: Record<string, Player | null> = {};
  for (const s of format.slots) filled[s.key] = null;
  return { format, filled, picks: [] };
}

/** Spin the wheel. Optional rarity weighting could bias toward star segments. */
export function spinWheel(segments: WheelSegment[], rng: () => number): WheelSegment {
  if (segments.length === 0) throw new Error("No wheel segments to spin.");
  const idx = Math.floor(rng() * segments.length);
  return segments[idx];
}

/** Slots still open that this player is eligible to fill. */
export function eligibleSlots(state: DraftState, player: Player): RosterSlot[] {
  return state.format.slots.filter(
    (s) => state.filled[s.key] === null && player.eligiblePos.includes(s.pos),
  );
}

export function canDraft(state: DraftState, player: Player): boolean {
  return eligibleSlots(state, player).length > 0;
}

/** Place a player into a specific slot (must be open & eligible). */
export function placePlayer(state: DraftState, player: Player, slotKey: string): DraftState {
  const slot = state.format.slots.find((s) => s.key === slotKey);
  if (!slot) throw new Error(`Unknown slot: ${slotKey}`);
  if (state.filled[slotKey] !== null) throw new Error(`Slot ${slotKey} already filled.`);
  if (!player.eligiblePos.includes(slot.pos)) {
    throw new Error(`${player.name} cannot play ${slot.pos}.`);
  }
  const filled = { ...state.filled, [slotKey]: player };
  return { ...state, filled, picks: [...state.picks, player] };
}

export function isComplete(state: DraftState): boolean {
  return state.format.slots.every((s) => state.filled[s.key] !== null);
}

const PITCHER_POS: Position[] = ["SP", "RP", "CL"];

/** Build a simulatable Team from a completed (or partial) draft. */
export function draftToTeam(state: DraftState, name: string): Team {
  const placed = state.format.slots
    .map((s) => ({ slot: s, player: state.filled[s.key] }))
    .filter((x): x is { slot: RosterSlot; player: Player } => x.player !== null);

  const lineup = placed
    .filter((x) => !PITCHER_POS.includes(x.slot.pos) && !x.slot.key.startsWith("BENCH"))
    .map((x) => x.player);

  const rotation = placed.filter((x) => x.slot.pos === "SP").map((x) => x.player);
  const bullpen = placed
    .filter((x) => x.slot.pos === "RP" || x.slot.pos === "CL")
    .map((x) => x.player);

  return { name, lineup, rotation, bullpen };
}
