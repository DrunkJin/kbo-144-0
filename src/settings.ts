// Game settings, modeled on 38-0's setup screen, adapted for KBO baseball.

export type Difficulty = "easy" | "normal" | "hard";
export type DraftMode = "squad" | "position";
export type RatingBasis = "season" | "prime";
export type SeasonMode = "instant" | "manager";
export type OpponentMode = "random" | "fixed";

export interface GameSettings {
  formatId: "simple" | "full"; // roster construction (38-0's "formation")
  difficulty: Difficulty; // grants rerolls; hard also hides ratings
  showRatings: boolean; // off = blind mode (stats hidden)
  draftMode: DraftMode; // squad-first vs position-first
  ratingBasis: RatingBasis; // that-season stats vs career-best (prime)
  seasonMode: SeasonMode; // instant sim vs series-by-series manager mode
  opponentMode: OpponentMode; // random year vs a designated year
  opponentYear: number; // used when opponentMode === "fixed"
  yearMin: number;
  yearMax: number;
}

export function defaultSettings(min: number, max: number): GameSettings {
  return {
    formatId: "simple",
    difficulty: "normal",
    showRatings: true,
    draftMode: "squad",
    ratingBasis: "season",
    seasonMode: "manager",
    opponentMode: "random",
    opponentYear: max,
    yearMin: min,
    yearMax: max,
  };
}

/** Rerolls granted by difficulty. */
export function rerollsFor(d: Difficulty): number {
  return d === "easy" ? 3 : d === "normal" ? 1 : 0;
}

/** Effective ratings visibility (Hard always hides them). */
export function ratingsVisible(s: GameSettings): boolean {
  return s.difficulty === "hard" ? false : s.showRatings;
}

/** Opponent strength boost by difficulty — how hard the league pushes back.
 *  Tuned so Normal lands even a stacked team mid-table (1위 is a real chase). */
export function oppBoostFor(d: Difficulty): number {
  return d === "easy" ? 0 : d === "normal" ? 0.08 : 0.15;
}

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; desc: string }> = {
  easy: { label: "이지", desc: "리롤 3회 · 상대 약함" },
  normal: { label: "노멀", desc: "리롤 1회 · 상대 강함" },
  hard: { label: "하드", desc: "리롤 없음 · 스탯 숨김 · 상대 최강" },
};

/** Era presets — set the lower bound of the year range. */
export const ERA_PRESETS: { label: string; from: number }[] = [
  { label: "전체", from: 1982 },
  { label: "2000년대+", from: 2000 },
  { label: "2010년대+", from: 2010 },
  { label: "현대 (2016+)", from: 2016 },
];
