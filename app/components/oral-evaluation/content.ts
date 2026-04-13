/** Copy for evaluator experience (frontend-only mock). */

export const LANDING = {
  eyebrow: "Checkride oral preparation",
  headline: "Practice Your FAA Checkride Oral Like It's Real.",
  lead:
    "This is not a multiple-choice quiz. You get scenario-based prompts and structured feedback written like an examiner debrief — the same kind of judgment you will face in the aircraft.",
  steps: [
    { n: "1", title: "Scenario", desc: "A realistic oral prompt, the way a DPE would ask it." },
    { n: "2", title: "Your response", desc: "Answer in your own words, under time pressure you control." },
    { n: "3", title: "Evaluation", desc: "Clear judgment first, then what worked, what didn’t, and a stronger answer." },
  ],
  cta: "Begin session",
} as const;

export const SESSION = {
  contextLabel: "Preflight preparation",
  promptLine: "Walk me through your preparation for this flight.",
  scenario:
    "You are planning a VFR cross-country from KFXE to KORL. How will you prepare for the trip?",
} as const;

export type ScoreValue = 0 | 1 | 2 | 3;

/** Judgment leads; tone is examiner debrief, not textbook. */
export const EVALUATION = {
  score: 2 as ScoreValue,
  /** Short outcome bucket shown beside score. */
  outcomeLabel: "Incomplete",
  /** Primary judgment — large, centered. */
  judgment: "Adequate, but incomplete",
  /** One-line examiner framing under the judgment. */
  examinerNote:
    "I need to hear a complete preflight picture before I would sign you off on this item.",
  correct: [
    "You brought up weather and NOTAMs — that’s the right place to start.",
    "You mentioned using the sectional for route planning.",
  ],
  missed: [
    "You never walked me through performance, weight and balance, or runway analysis for this trip.",
    "Alternates and fuel reserve needed to be explicit, not implied.",
  ],
  stronger:
    "Lead with IMSAFE, then weather, NOTAMs, route, performance, fuel with reserve, alternates, and how each piece feeds your go/no-go. I should hear it in order without me pulling it out of you.",
  why: "On a checkride I’m not testing memorization — I’m testing whether you can run a complete preflight decision in real time. Gaps here are gaps in safety.",
} as const;

/** Full-screen “evaluating” moment before feedback (no spinner). */
export const EVALUATING_MS = 2600;
