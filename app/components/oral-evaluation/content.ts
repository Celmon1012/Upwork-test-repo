/** Oral checkride evaluator — shared types and labels. Question bodies load from Supabase. */

export type ScoreValue = 0 | 1 | 2 | 3;

export const DEBRIEF_LABELS = {
  correct: "What was correct",
  missed: "What was missed",
  stronger: "Stronger answer",
  why: "Why it matters",
} as const;

export type EvaluationBlock = {
  score: ScoreValue;
  /** Short outcome tag next to the score (e.g. Incomplete, Satisfactory). */
  outcomeLabel: string;
  /** Headline judgment — reads like a verbal disposition, not a badge. */
  judgment: string;
  /** First-person examiner note — the human stake. */
  examinerNote: string;
  correct: readonly string[];
  missed: readonly string[];
  stronger: string;
  why: string;
  /**
   * Post-feedback reinforcement — spoken-style teaching the examiner can add
   * if the user wants to dig deeper. 2–3 short thoughts, in the same voice.
   */
  deeperExplanation: readonly string[];
};

export type RubricPoint = { label: string; keywords: readonly string[] };

export type OralItem = {
  /** Database primary key (`questions.id`) for persistence tables. */
  questionDbId: string;
  id: string;
  /** Short scene context only (e.g. "Preflight preparation") — not a course breadcrumb. */
  contextLabel: string;
  /** One clear ask; how a DPE opens the item. */
  promptLine: string;
  /** Scenario grounding — aircraft, route, or condition. */
  scenario: string;
  evaluation: EvaluationBlock;
  /**
   * Static, per-question strong sample answer shown via "Show Me Answer".
   * Each entry is one clean, standalone line — checkride-ready, no explanation.
   */
  sampleAnswer: readonly string[];
  /** Rubric lines used for keyword coverage scoring (from `rubrics` rows). */
  rubricPoints: readonly RubricPoint[];
};

/** Phase 1 target think window (ms); actual delay is randomized in the experience. */
export const EVALUATING_MS = 1500;
