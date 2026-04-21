/**
 * Client-spec examiner voice: judgment (1 line) → pressure → 1–2 gaps → retry push.
 * Not ChatGPT — short, spoken, sometimes blunt, sometimes cut-off, never tidy.
 *
 * Each turn randomly samples from a pool of variants so repeat passes on the
 * same item don't land identically. Some variants are full sentences; others
 * are deliberately curt ("Too general.", "Again.") — that unevenness is the
 * point. A real examiner doesn't phrase feedback consistently.
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

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Occasionally drop the third beat (pressure + one gap, no retry push). */
function maybeDrop(): boolean {
  return Math.random() < 0.22;
}

// ---------- Gap phrasing (blunter + softer blends randomly) ----------

function gapOne(label: string): string {
  const variants = [
    `Where's your ${label}?`,
    `What about ${label}?`,
    `Nothing on ${label}?`,
    `${capFirst(label)}?`,
    `And ${label}?`,
    `You skipped ${label}.`,
  ];
  return pick(variants);
}

function gapTwo(a: string, b: string): string {
  const variants = [
    `Where's your ${a}? Where's ${b}?`,
    `${capFirst(a)}? ${capFirst(b)}?`,
    `Nothing on ${a}. Nothing on ${b}.`,
    `Say something about ${a}. Say something about ${b}.`,
    `What about ${a}? And ${b}?`,
    `${capFirst(a)} — ${b} — neither one came out.`,
  ];
  return pick(variants);
}

function gapsWherePair(missed: readonly RubricPoint[]): string {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) return gapTwo(a, b);
  if (a) return gapOne(a);
  return pick([
    "What are you not telling me?",
    "Something's missing.",
    "There's a piece you're skipping.",
  ]);
}

function capFirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ---------- Weak judgments (score 1) — bluntness pool ----------

const weakJudgmentPool: readonly string[] = [
  "That's not sufficient.",
  "Not sufficient.",
  "That's not it.",
  "No.",
  "Not enough.",
  "That's too general.",
  "That won't fly.",
  "Try again.",
];

// ---------- Adequate judgments (score 2) ----------

const adequateJudgmentPool: readonly string[] = [
  "Still incomplete.",
  "Closer.",
  "Getting there.",
  "Not yet.",
  "Almost — not quite.",
  "Part of it.",
];

// ---------- Pass judgments (score 3) ----------

const passJudgmentPool: readonly string[] = [
  "That's sufficient.",
  "Good.",
  "That'll do.",
  "Fine.",
  "That works.",
];

// ---------- Adequate pressure per item (score 2) ----------

const adequatePressurePool: Record<string, readonly string[]> = {
  "preflight-prep": [
    "You're in the neighborhood — I'm not hearing a defendable process.",
    "Parts are there. Nothing I can grade cleanly.",
    "Surface-level.",
  ],
  "lost-comms-vfr": [
    "Parts are there — I need the sequence clean.",
    "You're piecing it together. Not tight enough.",
    "I can't tell you've flown it.",
  ],
  "stall-spin": [
    "Closer — I still can't picture you recovering under stress.",
    "You know the words. I don't hear the airplane.",
    "Not enough feel.",
  ],
  "night-currency": [
    "Touched it. Not tied together.",
    "Where's the math?",
    "Pieces — not a decision.",
  ],
  "crosswind-gusts": [
    "Generic crosswind talk isn't enough today.",
    "You're not managing the day — just describing it.",
    "Too clean for gusty conditions.",
  ],
};

// ---------- Pass pressure / closer (score 3) — less uniform ----------

const passPressurePool: readonly string[] = [
  "That's a checkride answer.",
  "Clean.",
  "That held together.",
  "You owned that one.",
];

const passCloserPool: readonly string[] = [
  "Move on when you're ready.",
  "Next.",
  "We're done on this one.",
  "Take the next one.",
];

// ---------- Retry push — shorter blunter variants ----------

const retryPushPool: readonly string[] = [
  "Walk me through it again.",
  "From the top.",
  "Again.",
  "Start over.",
  "Try it once more.",
  "Again — properly this time.",
];

const retryPushLostComms: readonly string[] = [
  "Walk me through it step by step.",
  "Step by step.",
  "In order this time.",
  "First action first.",
];

const retryPushStall: readonly string[] = [
  "Cues first. Then priorities. Out loud.",
  "Again — cues, priorities, recovery.",
  "Say it like you're flying it.",
];

const retryPushNight: readonly string[] = [
  "Regulation, definition, landings, window, answer. Again.",
  "Rule first. Then the math. Then your call.",
  "Walk it — rule, math, decision.",
];

const retryPushCrosswind: readonly string[] = [
  "Setup, short final, personal limits. Again.",
  "Full picture — setup through limits.",
  "Again — and commit to limits this time.",
];

// ---------- Weak pressure per item (score 1) ----------

const weakPressurePool: Record<string, readonly string[]> = {
  "preflight-prep": [
    "You're giving general ideas, not a full process.",
    "Too general.",
    "That's a checklist name, not a plan.",
    "Words, not a process.",
  ],
  "lost-comms-vfr": [
    "You jumped straight to the end.",
    "You skipped the first thing.",
    "Out of order.",
    "That's the outcome — I need the work.",
  ],
  "stall-spin": [
    "That sounds like words from a book.",
    "Book answer. I need cues and priorities.",
    "Too textbook.",
    "I don't hear you in the airplane.",
  ],
  "night-currency": [
    "I need a conclusion — not 'probably.'",
    "That's not a decision.",
    "Give me yes or no and why.",
    "Vibes won't pass this.",
  ],
  "crosswind-gusts": [
    "Not enough depth for gusty, limiting conditions.",
    "Too shallow for the day.",
    "That's normal-day crosswind. It's not a normal day.",
    "Surface-level.",
  ],
};

const weakPressureFallback: readonly string[] = [
  "That doesn't hold up.",
  "Not enough.",
  "Too general.",
  "That's thin.",
];

// ---------- Build a turn ----------

export function buildExaminerSpokenTurn(
  itemId: string,
  score: ScoreValue,
  missed: readonly RubricPoint[],
): ExaminerSpokenTurn {
  if (score >= 3) {
    const pressure = pick(passPressurePool);
    const closer = pick(passCloserPool);
    return {
      judgment: pick(passJudgmentPool),
      examinerNote: "",
      spokenBeats: [pressure, closer, ""],
    };
  }

  if (score === 2) {
    const pressurePool =
      adequatePressurePool[itemId] ?? weakPressureFallback;
    const pressure = pick(pressurePool);
    const gaps = gapsWherePair(missed.slice(0, 2));
    const retry = pickRetryFor(itemId);
    // Sometimes skip the retry push entirely — the silence is the pressure.
    const drop = maybeDrop();
    return {
      judgment: pick(adequateJudgmentPool),
      examinerNote: "",
      spokenBeats: [pressure, gaps, drop ? "" : retry],
    };
  }

  const pressurePool = weakPressurePool[itemId] ?? weakPressureFallback;
  const pressure = pick(pressurePool);
  const gaps = gapsWherePair(missed.slice(0, 2));
  const retry = pickRetryFor(itemId);
  const drop = maybeDrop();
  return {
    judgment: pick(weakJudgmentPool),
    examinerNote: "",
    spokenBeats: [pressure, gaps, drop ? "" : retry],
  };
}

function pickRetryFor(itemId: string): string {
  if (itemId === "lost-comms-vfr") return pick(retryPushLostComms);
  if (itemId === "stall-spin") return pick(retryPushStall);
  if (itemId === "night-currency") return pick(retryPushNight);
  if (itemId === "crosswind-gusts") return pick(retryPushCrosswind);
  return pick(retryPushPool);
}

/** Filter empty trailing beats (pass path uses a shorter third line). */
export function compactSpokenBeats(
  beats: readonly [string, string, string],
): readonly string[] {
  return beats.map((s) => s.trim()).filter((s) => s.length > 0);
}
