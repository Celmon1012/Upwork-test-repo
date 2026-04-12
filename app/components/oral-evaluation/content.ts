/** Phase 1 mock content (frontend-only). */

export const SCENARIO =
  "You are planning a VFR cross-country flight from KFXE to KORL. How will you prepare for the trip?";

export const CATEGORY = "Preflight Preparation";

export type ScoreValue = 0 | 1 | 2 | 3;

/** Full evaluation (after Submit). */
export const EVALUATION = {
  score: 2 as ScoreValue,
  scoreLabel: "Adequate, but incomplete",
  correct: [
    "You mentioned checking weather and NOTAMs.",
    "You referenced using a sectional for route planning.",
  ],
  missed: [
    "You did not mention aircraft performance or weight and balance.",
    "You did not discuss alternates or fuel reserve planning in detail.",
  ],
  stronger:
    "Start with IM SAFE, then walk through weather, route, performance, fuel, alternates, and NOTAMs in order. Tie each item to how it affects your go/no-go decision.",
  why: "Preflight preparation reduces risk on cross-country flights by ensuring you identify hazards before you are airborne.",
} as const;

/** Shorter copy when the user skips without submitting (after Skip). */
export const SKIPPED_EVALUATION = {
  headline: "Question skipped",
  subline: "No score — evaluation was not run.",
  correct: ["You did not submit an answer for this prompt."],
  missed: [
    "A full oral response was not recorded, so detailed feedback is unavailable.",
  ],
  stronger:
    "When you are ready, type your answer and tap Submit to receive a scored evaluation and section-by-section notes.",
  why: "Structured answers build the habit of complete preflight thinking and clear communication with examiners.",
} as const;

/** After Submit: intentional pause before feedback (1–2s, no spinner). */
export const SUBMIT_TO_FEEDBACK_MS = 1500;

/** After Skip: quicker transition; still feels intentional. */
export const SKIP_TO_FEEDBACK_MS = 550;
