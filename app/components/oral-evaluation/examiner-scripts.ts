/**
 * Phase 1 examiner voice (lost comms VFR only): judgment → pressure → 1–2 gaps
 * → retry push. `repeatMissDepth > 0` after **Try again** escalates copy (second
 * failure onward): judgment, then pressure → short order beats → retry.
 */

import type { ScoreValue } from "./content";

export type RubricPoint = { label: string; keywords: readonly string[] };

export type ExaminerTurnOptions = {
  /**
   * 0 = first miss on this item (this visit).
   * 1+ = user already missed and hit Try again — examiner escalates.
   */
  repeatMissDepth?: number;
};

export type ExaminerSpokenTurn = {
  judgment: string;
  /** Kept for EvaluationBlock compatibility; immersive UI leaves headline-only. */
  examinerNote: string;
  /**
   * After the headline: pressure, then one or two **separate** gap lines when
   * two rubric holes, then retry (miss path). Pass path: pressure + closer only.
   */
  spokenBeats: readonly string[];
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ---------- Gap phrasing — sharp, oral (no “what about”, no soft asks) ----------

/** Bias toward the client’s two patterns: “I didn’t hear X.” / “Where’s your X?” */
function gapOne(label: string): string {
  const primary: readonly string[] = [
    `I didn't hear ${label}.`,
    `Where's your ${label}?`,
  ];
  const secondary: readonly string[] = [
    `Not hearing ${label}.`,
    `No ${label}.`,
    `Still missing ${label}.`,
  ];
  return Math.random() < 0.62 ? pick(primary) : pick([...primary, ...secondary]);
}

/** Two rubric gaps as **separate** spoken lines (oral cadence, not one compound sentence). */
function gapLinesFromTopMisses(missed: readonly RubricPoint[]): readonly string[] {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) {
    if (Math.random() < 0.5) {
      return [`Where's your ${a}?`, `I didn't hear ${b}.`];
    }
    return [`I didn't hear ${a}.`, `Where's your ${b}?`];
  }
  if (a) return [gapOne(a)];
  return [
    pick([
      "Not enough there.",
      "Too thin. Name it.",
      "Spell it out.",
    ]),
  ];
}

// ---------- Escalation (repeat miss on same item) ----------

const escalationJudgmentPool: readonly string[] = [
  "Still not there.",
  "Same problem.",
  "Not there yet.",
  "Didn't fix it.",
];

function pickEscalationJudgment(repeatDepth: number): string {
  // First repeat miss: blunt headline so the structured beats land harder.
  if (repeatDepth === 1) {
    return Math.random() < 0.82 ? "Still not there." : pick(escalationJudgmentPool);
  }
  if (repeatDepth === 2 && Math.random() < 0.4) return "Same problem.";
  return pick(escalationJudgmentPool);
}

/** After judgment: pressure → short stack beats → retry. */
type EscalationStructured = {
  readonly kind: "structured";
  readonly pressure: string;
  /** One oral beat per string — keep each line tiny. */
  readonly orderBeats: readonly string[];
  readonly retry: string;
};

type EscalationThreeBeat = {
  readonly kind: "threeBeat";
  readonly pressure: string;
  readonly gaps: string;
  readonly retry: string;
};

type EscalationScript = EscalationStructured | EscalationThreeBeat;

function spokenBeatsFromEscalation(script: EscalationScript): readonly string[] {
  if (script.kind === "structured") {
    return [script.pressure, ...script.orderBeats, script.retry];
  }
  return [script.pressure, script.gaps, script.retry];
}

/**
 * Phase 1: one scenario (`lost-comms-vfr`). Deeper `repeatMissDepth` rotates
 * scripts so repeat misses do not read as the same block.
 */
const escalationByItem: Record<string, readonly EscalationScript[]> = {
  "lost-comms-vfr": [
    {
      kind: "structured",
      pressure: "No sequence.",
      orderBeats: [
        "Verify failure. Squawk.",
        "Then continue VFR.",
      ],
      retry: "Go again.",
    },
    {
      kind: "structured",
      pressure: "Need order.",
      orderBeats: [
        "7600 first.",
        "Route, then altitude, then intention.",
      ],
      retry: "Again. Out loud.",
    },
    {
      kind: "structured",
      pressure: "Third pass. No blanks.",
      orderBeats: [
        "Code it. Fly 91.185 order.",
        "VFR landing? Say why it's legal.",
      ],
      retry: "Now.",
    },
  ],
};

function buildEscalatedTurn(
  itemId: string,
  _score: ScoreValue,
  missed: readonly RubricPoint[],
  depth: number,
): ExaminerSpokenTurn {
  const pool = escalationByItem[itemId];
  const tier = pool?.length ? Math.min(depth - 1, pool.length - 1) : 0;
  const scripted = pool?.[tier];

  if (scripted) {
    return {
      judgment: pickEscalationJudgment(depth),
      examinerNote: "",
      spokenBeats: spokenBeatsFromEscalation(scripted),
    };
  }

  const gapLines = gapLinesFromTopMisses(missed.slice(0, 2));
  const pressureLine =
    depth >= 3
      ? "Third miss. Change it."
      : depth >= 2
        ? "Same circle. New shape."
        : "Same gap. More.";
  return {
    judgment: pickEscalationJudgment(depth),
    examinerNote: "",
    spokenBeats: [pressureLine, ...gapLines, pick(retryPushLostComms)],
  };
}

// ---------- Weak judgments (score 1) ----------

const weakJudgmentPool: readonly string[] = [
  "Not sufficient.",
  "No.",
  "Not enough.",
  "Too general.",
  "Insufficient.",
  "That won't fly.",
];

// ---------- Adequate judgments (score 2) ----------

const adequateJudgmentPool: readonly string[] = [
  "Incomplete.",
  "Not yet.",
  "Not quite.",
  "Still thin.",
  "Not enough.",
];

// ---------- Pass judgments (score 3) ----------

const passJudgmentPool: readonly string[] = [
  "That's sufficient.",
  "Good.",
  "That'll do.",
  "Fine.",
  "Satisfactory.",
];

// ---------- Adequate pressure per item (score 2) — short spoken ----------

const adequatePressurePool: Record<string, readonly string[]> = {
  "lost-comms-vfr": [
    "Can't grade that order.",
    "Not flown. Just said.",
    "Pieces. No order.",
  ],
};

const passPressurePool: readonly string[] = [
  "Checkride answer.",
  "Clean.",
  "That held.",
  "Good enough.",
];

const passCloserPool: readonly string[] = [
  "Move on.",
  "Next.",
  "Done here.",
  "Next one.",
];

const retryPushLostComms: readonly string[] = [
  "Step by step. Go.",
  "In order. Again.",
  "First move first. Again.",
];

const weakPressurePool: Record<string, readonly string[]> = {
  "lost-comms-vfr": [
    "You jumped to the end.",
    "Out of order.",
    "Landing first. No setup.",
  ],
};

const weakPressureFallback: readonly string[] = [
  "Doesn't hold up.",
  "Not enough.",
  "Too thin.",
  "Again. Tighter.",
];

export function buildExaminerSpokenTurn(
  itemId: string,
  score: ScoreValue,
  missed: readonly RubricPoint[],
  options?: ExaminerTurnOptions,
): ExaminerSpokenTurn {
  const depth = Math.min(Math.max(0, options?.repeatMissDepth ?? 0), 3);

  if (score >= 3) {
    const pressure = pick(passPressurePool);
    const closer = pick(passCloserPool);
    return {
      judgment: pick(passJudgmentPool),
      examinerNote: "",
      spokenBeats: [pressure, closer],
    };
  }

  if (depth > 0) {
    return buildEscalatedTurn(itemId, score, missed, depth);
  }

  if (score === 2) {
    const pressurePool =
      adequatePressurePool[itemId] ?? weakPressureFallback;
    const pressure = pick(pressurePool);
    const gapLines = gapLinesFromTopMisses(missed.slice(0, 2));
    const retry = pick(retryPushLostComms);
    return {
      judgment: pick(adequateJudgmentPool),
      examinerNote: "",
      spokenBeats: [pressure, ...gapLines, retry],
    };
  }

  const pressurePool = weakPressurePool[itemId] ?? weakPressureFallback;
  const pressure = pick(pressurePool);
  const gapLines = gapLinesFromTopMisses(missed.slice(0, 2));
  const retry = pick(retryPushLostComms);
  return {
    judgment: pick(weakJudgmentPool),
    examinerNote: "",
    spokenBeats: [pressure, ...gapLines, retry],
  };
}

/** Trim and drop empty beats. */
export function compactSpokenBeats(beats: readonly string[]): readonly string[] {
  return beats.map((s) => s.trim()).filter((s) => s.length > 0);
}
