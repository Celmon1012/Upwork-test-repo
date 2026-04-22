/**
 * Phase 1 examiner voice (lost comms VFR only): judgment → pressure → 1–2 gaps
 * → retry push. `repeatMissDepth > 0` after **Try again** escalates copy (second
 * failure onward), including two-beat (pressure + order/close) or three-beat scripts.
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
  /** Three beats after the headline: pressure, gaps, retry push. */
  spokenBeats: readonly [string, string, string];
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
    `I'm not hearing ${label}.`,
    `You didn't give me ${label}.`,
    `I still don't have ${label}.`,
    `I'm waiting on ${label}.`,
  ];
  return Math.random() < 0.62 ? pick(primary) : pick([...primary, ...secondary]);
}

function gapTwo(a: string, b: string): string {
  const primary: readonly string[] = [
    `I didn't hear ${a}. I didn't hear ${b}.`,
    `Where's your ${a}? Where's your ${b}?`,
    `Where's your ${a}? I didn't hear ${b}.`,
    `I didn't hear ${a}. Where's your ${b}?`,
  ];
  const secondary: readonly string[] = [
    `I didn't get ${a}, and I didn't get ${b} either.`,
    `You skipped ${a} and ${b}.`,
    `I'm missing both ${a} and ${b}.`,
  ];
  return Math.random() < 0.58 ? pick(primary) : pick([...primary, ...secondary]);
}

function gapsWherePair(missed: readonly RubricPoint[]): string {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) return gapTwo(a, b);
  if (a) return gapOne(a);
  return pick([
    "I didn't hear enough.",
    "That was thin. Say what you're skipping.",
    "You're holding back. Spell it out.",
  ]);
}

function capFirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ---------- Escalation (repeat miss on same item) ----------

const escalationJudgmentPool: readonly string[] = [
  "Still not there.",
  "Same problem.",
  "No — we're not there yet.",
  "That didn't fix it.",
];

function pickEscalationJudgment(repeatDepth: number): string {
  // First repeat miss: lean on the client’s headline so it lands like a real oral.
  if (repeatDepth === 1 && Math.random() < 0.5) return "Still not there.";
  return pick(escalationJudgmentPool);
}

/** Two beats after judgment: pressure, then structured close (order + go again in one line). */
type EscalationTwoBeat = {
  readonly kind: "twoBeat";
  readonly pressure: string;
  /** Order / structure + close — one spoken unit, not a separate “retry” chip. */
  readonly orderAndClose: string;
};

type EscalationThreeBeat = {
  readonly kind: "threeBeat";
  readonly pressure: string;
  readonly gaps: string;
  readonly retry: string;
};

type EscalationScript = EscalationTwoBeat | EscalationThreeBeat;

function spokenTripletFromEscalation(
  script: EscalationScript,
): readonly [string, string, string] {
  if (script.kind === "twoBeat") {
    return [script.pressure, script.orderAndClose, ""];
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
      kind: "twoBeat",
      pressure: "Still out of order.",
      orderAndClose:
        "Confirm failure, then lights, route, altitude, intention. That order. Go again.",
    },
    {
      kind: "twoBeat",
      pressure: "You keep skipping to the end.",
      orderAndClose:
        "First move before 7600. Say it again.",
    },
    {
      kind: "threeBeat",
      pressure: "Same miss. I'm being literal.",
      gaps: "Not squawk-and-land. I need the order.",
      retry: "Step by step. Now.",
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
      spokenBeats: spokenTripletFromEscalation(scripted),
    };
  }

  const g = gapsWherePair(missed.slice(0, 2));
  return {
    judgment: pickEscalationJudgment(depth),
    examinerNote: "",
    spokenBeats: [
      depth >= 3
        ? "Third miss — change the answer."
        : depth >= 2
          ? "Same circle. Different structure."
          : "Same gap. More this time.",
      g,
      pick(retryPushLostComms),
    ],
  };
}

// ---------- Weak judgments (score 1) ----------

const weakJudgmentPool: readonly string[] = [
  "That's not sufficient.",
  "Not sufficient.",
  "No.",
  "Not enough.",
  "That's too general.",
  "That won't fly.",
  "Insufficient.",
];

// ---------- Adequate judgments (score 2) ----------

const adequateJudgmentPool: readonly string[] = [
  "Still incomplete.",
  "Not yet.",
  "Not quite.",
  "Incomplete.",
  "Closer — not enough.",
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
    "Sequence still isn't clean enough to grade.",
    "I can't tell you've flown this.",
    "Pieces, not order.",
  ],
};

const passPressurePool: readonly string[] = [
  "That's a checkride answer.",
  "Clean.",
  "That held.",
  "Good enough.",
];

const passCloserPool: readonly string[] = [
  "Move on when ready.",
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
    "Landing first — I need the setup.",
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
      spokenBeats: [pressure, closer, ""],
    };
  }

  if (depth > 0) {
    return buildEscalatedTurn(itemId, score, missed, depth);
  }

  if (score === 2) {
    const pressurePool =
      adequatePressurePool[itemId] ?? weakPressureFallback;
    const pressure = pick(pressurePool);
    const gaps = gapsWherePair(missed.slice(0, 2));
    const retry = pick(retryPushLostComms);
    return {
      judgment: pick(adequateJudgmentPool),
      examinerNote: "",
      spokenBeats: [pressure, gaps, retry],
    };
  }

  const pressurePool = weakPressurePool[itemId] ?? weakPressureFallback;
  const pressure = pick(pressurePool);
  const gaps = gapsWherePair(missed.slice(0, 2));
  const retry = pick(retryPushLostComms);
  return {
    judgment: pick(weakJudgmentPool),
    examinerNote: "",
    spokenBeats: [pressure, gaps, retry],
  };
}

/** Filter empty trailing beats (pass path uses a shorter third line). */
export function compactSpokenBeats(
  beats: readonly [string, string, string],
): readonly string[] {
  return beats.map((s) => s.trim()).filter((s) => s.length > 0);
}
