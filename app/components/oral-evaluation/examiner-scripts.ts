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
    `I didn't hear the ${label} piece.`,
    `Talk me through your ${label} piece.`,
  ];
  const secondary: readonly string[] = [
    `I'm still not hearing ${label}.`,
    `You skipped ${label}.`,
    `You're still missing ${label}.`,
  ];
  return Math.random() < 0.62 ? pick(primary) : pick([...primary, ...secondary]);
}

/** Two rubric gaps as **separate** spoken lines (oral cadence, not one compound sentence). */
function gapLinesFromTopMisses(missed: readonly RubricPoint[]): readonly string[] {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) {
    if (Math.random() < 0.5) {
      return [
        `Talk me through your ${a} piece.`,
        `I still didn't hear the ${b} piece.`,
      ];
    }
    return [
      `I still didn't hear the ${a} piece.`,
      `Now give me the ${b} piece.`,
    ];
  }
  if (a) return [gapOne(a)];
  return [
    pick([
      "That still isn't enough for me to grade.",
      "You're close, but I need the exact sequence out loud.",
      "Spell the full sequence out for me.",
    ]),
  ];
}

// ---------- Escalation (repeat miss on same item) ----------

const escalationJudgmentPool: readonly string[] = [
  "Still not there.",
  "Same gap as before.",
  "Not there yet.",
  "You still didn't fix the main miss.",
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
      pressure: "You're still giving me fragments instead of a sequence.",
      orderBeats: [
        "Start by confirming the failure and squawking 7600.",
        "Then stay VFR and walk the route and altitude stack in order.",
      ],
      retry: "Take a breath and run it again from the top.",
    },
    {
      kind: "structured",
      pressure: "I need this in flyable order, not just keywords.",
      orderBeats: [
        "7600 is first.",
        "Then route, then altitude, then your landing intention.",
      ],
      retry: "Give it to me again the way you'd brief it.",
    },
    {
      kind: "structured",
      pressure: "Third pass now, so I need a complete answer with no blanks.",
      orderBeats: [
        "State the code, then fly the 91.185 order without skipping steps.",
        "If you're landing VFR, tell me why that's legal here.",
      ],
      retry: "Run it now, cleanly and in order.",
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
      ? "Third miss now, so change the structure and make it complete."
      : depth >= 2
        ? "You're circling the same gap, so give me a cleaner structure."
        : "You're still missing the same piece, so I need more detail.";
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
  "That doesn't work yet.",
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
    "I can hear the idea, but I still can't grade the order.",
    "You said the right words, but not in a flyable sequence.",
    "You're giving me pieces, not the full order I need.",
  ],
};

const passPressurePool: readonly string[] = [
  "That's a checkride-ready answer.",
  "That was clean and in order.",
  "That holds up under pressure.",
  "That works.",
];

const passCloserPool: readonly string[] = [
  "Good. Let's move on.",
  "All right, next one.",
  "That's done. Next question.",
  "We'll move to the next scenario.",
];

const retryPushLostComms: readonly string[] = [
  "Go step by step from the first action.",
  "Run it again in order, out loud.",
  "Start with your first move and take me through it again.",
];

const weakPressurePool: Record<string, readonly string[]> = {
  "lost-comms-vfr": [
    "You jumped to the end without building the sequence.",
    "That answer is still out of order.",
    "You went to the landing outcome before setting it up.",
  ],
};

const weakPressureFallback: readonly string[] = [
  "That doesn't hold up yet.",
  "That answer isn't enough yet.",
  "It's still too thin for a checkride standard.",
  "Go again and tighten the structure.",
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
