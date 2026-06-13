// ────────────────────────────────────────────────────────────────────────────
// 144-0 — Core data types
// One file = one season of one player. Stats are season totals; rates are derived.
// ────────────────────────────────────────────────────────────────────────────

/** Batting season totals. 1B is derived (H - 2B - 3B - HR). */
export interface BatLine {
  PA: number;
  AB: number;
  H: number;
  d2B: number; // doubles
  d3B: number; // triples
  HR: number;
  BB: number;
  HBP: number;
  SO: number;
  SB: number;
}

/** Pitching season totals. */
export interface PitLine {
  IP: number; // innings pitched (decimal, e.g. 182.1ip -> 182.333)
  ER: number;
  H: number;
  HR: number;
  BB: number;
  HBP: number;
  SO: number;
  BF: number; // batters faced
  GS: number; // games started (to classify SP vs RP)
  SV: number; // saves (to flag closers)
}

export type Position =
  | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH"
  | "SP" | "RP" | "CL";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Player {
  id: string; // e.g. "2017-KIA-choi-hyoungwoo"
  pid?: string; // stable dataset player id (same person across seasons) — for Prime mode
  name: string;
  team: string; // KBO club code/name for that season
  season: number; // 1982..present
  primaryPos: Position;
  eligiblePos: Position[];
  bat?: BatLine | null;
  pit?: PitLine | null;
  war?: number; // optional, for wheel weighting / rarity
  rarity?: Rarity;
  primeSeason?: number; // when resolved to a career-best season (Prime mode)
}

// ── Roster format presets (selectable) ──────────────────────────────────────
export interface RosterSlot {
  pos: Position;
  /** unique slot key, e.g. "SP1", "OF2", "BENCH3" */
  key: string;
}

export interface RosterFormat {
  id: "simple" | "full";
  label: string;
  slots: RosterSlot[];
}

/** Simple = the 38-0-style minimal team: 9 lineup + 5 SP + 1 CL = 15. */
export const FORMAT_SIMPLE: RosterFormat = {
  id: "simple",
  label: "Simple (15) — 라인업 9 + 선발 5 + 마무리 1",
  slots: [
    { pos: "C", key: "C" },
    { pos: "1B", key: "1B" },
    { pos: "2B", key: "2B" },
    { pos: "3B", key: "3B" },
    { pos: "SS", key: "SS" },
    { pos: "LF", key: "LF" },
    { pos: "CF", key: "CF" },
    { pos: "RF", key: "RF" },
    { pos: "DH", key: "DH" },
    { pos: "SP", key: "SP1" },
    { pos: "SP", key: "SP2" },
    { pos: "SP", key: "SP3" },
    { pos: "SP", key: "SP4" },
    { pos: "SP", key: "SP5" },
    { pos: "CL", key: "CL" },
  ],
};

/** Full = realistic 26-man: 9 lineup + 4 bench + 5 SP + 7 RP + 1 CL. */
export const FORMAT_FULL: RosterFormat = {
  id: "full",
  label: "Full (26) — 야수 13 + 투수 13",
  slots: [
    { pos: "C", key: "C" },
    { pos: "1B", key: "1B" },
    { pos: "2B", key: "2B" },
    { pos: "3B", key: "3B" },
    { pos: "SS", key: "SS" },
    { pos: "LF", key: "LF" },
    { pos: "CF", key: "CF" },
    { pos: "RF", key: "RF" },
    { pos: "DH", key: "DH" },
    { pos: "C", key: "BENCH_C" },
    { pos: "1B", key: "BENCH_IF" },
    { pos: "LF", key: "BENCH_OF" },
    { pos: "DH", key: "BENCH_UT" },
    { pos: "SP", key: "SP1" },
    { pos: "SP", key: "SP2" },
    { pos: "SP", key: "SP3" },
    { pos: "SP", key: "SP4" },
    { pos: "SP", key: "SP5" },
    { pos: "RP", key: "RP1" },
    { pos: "RP", key: "RP2" },
    { pos: "RP", key: "RP3" },
    { pos: "RP", key: "RP4" },
    { pos: "RP", key: "RP5" },
    { pos: "RP", key: "RP6" },
    { pos: "RP", key: "RP7" },
    { pos: "CL", key: "CL" },
  ],
};

export const FORMATS: Record<RosterFormat["id"], RosterFormat> = {
  simple: FORMAT_SIMPLE,
  full: FORMAT_FULL,
};

/** A team = the 9 batters who hit + the pitchers who throw. */
export interface Team {
  name: string;
  season?: number;
  lineup: Player[]; // exactly 9 hitters (8 + DH)
  rotation: Player[]; // starting pitchers
  bullpen: Player[]; // relievers + closer
}
