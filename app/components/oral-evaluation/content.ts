/** Oral checkride evaluator — content only (frontend mock). Tone: DPE across the table, not product UI. */

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

export type OralItem = {
  id: string;
  /** Short scene context only (e.g. “Preflight preparation”) — not a course breadcrumb. */
  contextLabel: string;
  /** One clear ask; how a DPE opens the item. */
  promptLine: string;
  /** Scenario grounding — aircraft, route, or condition. */
  scenario: string;
  evaluation: EvaluationBlock;
};

/**
 * Phase 1: exactly one oral scenario. Runtime scoring and examiner copy live in
 * `OralEvaluationExperience` + `examiner-scripts`.
 */
export const ORAL_ITEMS: readonly OralItem[] = [
  {
    id: "lost-comms-vfr",
    contextLabel: "Lost communications",
    promptLine:
      "You’ve lost two-way radio communication in VFR conditions. What do you do, and in what order?",
    scenario:
      "Class E surface area, you’re VFR, flight following dropped out after your last acknowledgment. You’re not IFR.",
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — the sequence isn’t there",
      examinerNote:
        "I heard pieces of 91.185 in there. But I don’t think you could execute this cold on the ramp without me walking you through the order.",
      correct: [
        "You got to 91.185 — that’s your anchor, and you found it.",
        "You mentioned 7600. Fine. That belongs in this conversation.",
      ],
      missed: [
        "But the route priority — assigned, expected, filed — you didn’t walk me through that stack in a way I can grade.",
        "Same on altitude. Assigned, MEA, expected, and when you take the highest of them. That never came out as a sequence.",
      ],
      stronger:
        "Here’s what I want. Squawk 7600. Then fly the route under 91.185 in order — assigned, expected, filed — and altitude in the same priority. It should sound like a checklist you’ve briefed a hundred times, not like you’re figuring it out in the chair.",
      why: "On the ride I’ll hand you a lost-comms scenario and just watch what comes out. Partial recall doesn’t cut it when the radios go quiet.",
      deeperExplanation: [
        "91.185 is written as a priority list for a reason. When the radios go quiet, you don’t have time to re-derive it — you execute it.",
        "Route priority: assigned, expected, filed. Altitude priority: the highest of assigned, MEA, expected. Memorize the shape, not just the words.",
        "And 7600 first. Before anything else. ATC can’t help you if they don’t know you’re lost.",
      ],
    },
  },
] as const;

/** Phase 1 target think window (ms); actual delay is randomized in the experience. */
export const EVALUATING_MS = 1500;
