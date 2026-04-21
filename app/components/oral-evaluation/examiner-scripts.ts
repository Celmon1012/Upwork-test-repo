/**
 * Client-spec examiner voice: judgment (1 line) → pressure → 1–2 gaps → retry push.
 * Not ChatGPT — short, spoken, slightly uncomfortable, forces another performance.
 */

import type { ScoreValue } from "./content";

export type RubricPoint = { label: string; keywords: readonly string[] };

export type ExaminerSpokenTurn = {
  judgment: string;
  /** Kept for EvaluationBlock compatibility; immersive UI leaves headline-only. */
  examinerNote: string;
  /** Three beats after the headline: pressure, gaps, retry push. */
  spokenBeats: readonly [string, string, string];
};

/** Two gaps, conversational — not a bullet list of everything. */
function gapsWherePair(missed: readonly RubricPoint[]): string {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) {
    return `Where's your ${a}? Where's ${b}?`;
  }
  if (a) return `Where's your ${a}?`;
  return "What are you not telling me?";
}

/** Adequate: still firm; gaps always from rubric (first two misses). */
const adequatePressureByItem: Record<string, string> = {
  "preflight-prep":
    "You're in the neighborhood, but I'm not hearing a defendable process yet.",
  "lost-comms-vfr":
    "Parts are there — I need the sequence clean enough to grade without helping you.",
  "stall-spin":
    "Closer — but I still can't picture you flying the recovery under stress.",
  "night-currency":
    "You touched the rule — I need the pieces tied together with numbers.",
  "crosswind-gusts":
    "Generic crosswind talk isn't enough when the day is actually limiting.",
};

const adequateJudgment = "Still incomplete.";

const passJudgment = "That's sufficient.";
const passPressure = "You answered it the way I'd expect on a checkride.";
const passCloser = "We're done on this one — move on when you're ready.";

type WeakPathScript = {
  judgment: string;
  examinerNote: string;
  pressure: string;
  gaps: string | ((missed: readonly RubricPoint[]) => string);
  retryPush: string;
};

/** Weak path — matches client examples where provided; same structure everywhere. */
const weakScripts: Record<string, WeakPathScript> = {
  "preflight-prep": {
    judgment: "That's not sufficient.",
    examinerNote: "",
    pressure: "You're giving general ideas, not a full process.",
    gaps: (missed) =>
      missed.length >= 2
        ? gapsWherePair(missed.slice(0, 2))
        : "Where's your performance planning? Where's weight and balance?",
    retryPush: "Walk me through it again from the beginning.",
  },
  "lost-comms-vfr": {
    judgment: "Not sufficient.",
    examinerNote: "",
    pressure: "You jumped straight to the end.",
    gaps: "What are you doing first? Are you sure it's even a real failure?",
    retryPush: "Walk me through it step by step.",
  },
  "stall-spin": {
    judgment: "Not enough.",
    examinerNote: "",
    pressure:
      "That sounds like words from a book — I need cues, priorities, and a recovery I can picture.",
    gaps: (missed) => gapsWherePair(missed.slice(0, 2)),
    retryPush: "Again — cues first, then priorities, out loud and in order.",
  },
  "night-currency": {
    judgment: "That's not a decision.",
    examinerNote: "",
    pressure:
      "I need a conclusion I can hold you to — not 'probably' and not vibes.",
    gaps: (missed) => gapsWherePair(missed.slice(0, 2)),
    retryPush:
      "Walk me through it again — regulation, night definition, landings, 90-day window, then your answer.",
  },
  "crosswind-gusts": {
    judgment: "Incomplete.",
    examinerNote: "",
    pressure: "That's not enough depth for gusty, limiting conditions.",
    gaps: (missed) => gapsWherePair(missed.slice(0, 2)),
    retryPush:
      "Give me the full picture — setup, what you're managing on short final, and your personal limits.",
  },
};

function resolveGaps(
  gaps: string | ((missed: readonly RubricPoint[]) => string),
  missed: readonly RubricPoint[],
): string {
  return typeof gaps === "function" ? gaps(missed) : gaps;
}

/**
 * Builds the four-part client structure (headline + three spoken beats).
 * examinerNote is always empty so JudgmentBlock stays one line only.
 */
export function buildExaminerSpokenTurn(
  itemId: string,
  score: ScoreValue,
  missed: readonly RubricPoint[],
): ExaminerSpokenTurn {
  if (score >= 3) {
    return {
      judgment: passJudgment,
      examinerNote: "",
      spokenBeats: [passPressure, passCloser, ""],
    };
  }

  const script = weakScripts[itemId];

  // Adequate — same shape: pressure, two gaps from rubric, retry push.
  if (score === 2) {
    const pressure =
      adequatePressureByItem[itemId] ??
      script?.pressure ??
      "I'm still not hearing a complete checkride answer.";
    const gaps = gapsWherePair(missed.slice(0, 2));
    const retry =
      itemId === "lost-comms-vfr"
        ? "Walk me through it step by step."
        : "Walk me through it again from the beginning.";
    return {
      judgment: adequateJudgment,
      examinerNote: "",
      spokenBeats: [pressure, gaps, retry],
    };
  }

  // Weak — scripted per topic where defined.
  if (!script) {
    const pressure = "That doesn't hold up yet.";
    const gaps = gapsWherePair(missed.slice(0, 2));
    const retry = "Walk me through it again from the top.";
    return {
      judgment: "Not sufficient.",
      examinerNote: "",
      spokenBeats: [pressure, gaps, retry],
    };
  }

  const gaps = resolveGaps(script.gaps, missed);
  return {
    judgment: script.judgment,
    examinerNote: "",
    spokenBeats: [script.pressure, gaps, script.retryPush],
  };
}

/** Filter empty trailing beats (pass path uses a shorter third line). */
export function compactSpokenBeats(
  beats: readonly [string, string, string],
): readonly string[] {
  return beats.map((s) => s.trim()).filter((s) => s.length > 0);
}
