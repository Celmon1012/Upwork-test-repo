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

/** Oral gaps — short, direct, a little uneven on purpose (spoken, not scripted). */
function gapOne(label: string): string {
  const primary: readonly string[] = [
    `I didn't hear ${label}.`,
    `Where's ${label} in what you just said?`,
    `Walk me through ${label}.`,
  ];
  const secondary: readonly string[] = [
    `${label} didn't really come out.`,
    `You glossed over ${label}.`,
    `I'm still waiting on ${label}.`,
    `We need ${label} — I can't skip it.`,
  ];
  return Math.random() < 0.58 ? pick(primary) : pick([...primary, ...secondary]);
}

/** Two rubric gaps as **separate** spoken lines (oral cadence, not one compound sentence). */
function gapLinesFromTopMisses(missed: readonly RubricPoint[]): readonly string[] {
  const a = missed[0]?.label;
  const b = missed[1]?.label;
  if (a && b) {
    if (Math.random() < 0.5) {
      return [
        `Start with ${a} — I need that clean.`,
        `And ${b}? Still not hearing it.`,
      ];
    }
    return [
      `${a} first. Then we talk about ${b}.`,
      `${b} — that's the next hole.`,
    ];
  }
  if (a) return [gapOne(a)];
  return [
    pick([
      "That's still not enough for me to sign off on.",
      "You're in the neighborhood, but I need the sequence out loud — the real one.",
      "Say the whole stack. Don't make me pull it out of you.",
    ]),
  ];
}

// ---------- Escalation (repeat miss on same item) ----------

const escalationJudgmentPool: readonly string[] = [
  "Still not there.",
  "Same gap as before.",
  "Not there yet.",
  "You still didn't fix the main miss.",
  "I'm still not signing off on that.",
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
    return [
      script.pressure,
      ...script.orderBeats,
      script.retry,
      pick(finalRespondChallengePool),
    ];
  }
  return [script.pressure, script.gaps, script.retry, pick(finalRespondChallengePool)];
}

/**
 * Phase 1: one scenario (`lost-comms-vfr`). Deeper `repeatMissDepth` rotates
 * scripts so repeat misses do not read as the same block.
 */
const escalationByItem: Record<string, readonly EscalationScript[]> = {
  "lost-comms-vfr": [
    {
      kind: "structured",
      pressure:
        "Second try, and I'm still getting fragments — not something I can fly in my head.",
      orderBeats: [
        "Squawk the failure. 7600. First.",
        "Then stay VFR and walk route and altitude in order — don't skip.",
      ],
      retry: "Breathe. Top to bottom, out loud, like I'm sitting right here.",
    },
    {
      kind: "structured",
      pressure:
        "I can't grade keywords. I need the order you'd actually fly.",
      orderBeats: [
        "7600 first — always.",
        "Then route, altitude, then what you're doing about landing. In that order.",
      ],
      retry: "Again — same table, same pressure. Go.",
    },
    {
      kind: "structured",
      pressure: "Third time. No holes — or we park on this one.",
      orderBeats: [
        "Code, then the 91.185 stack. Every step.",
        "If you're landing VFR, say why that's legal here — defend it.",
      ],
      retry: "Clean. In order. Now.",
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

  const gapLines = gapLinesFromTopMisses(missed.slice(0, 2)).slice(0, 1);
  const pressureLine =
    depth >= 3
      ? "Third miss — change how you're saying it or we're not moving."
      : depth >= 2
        ? "You're circling the same gap. I need a full answer, not another pass at it."
        : "Same hole as before — dig in; give me something I can actually grade.";
  return {
    judgment: pickEscalationJudgment(depth),
    examinerNote: "",
    spokenBeats: [pressureLine, ...gapLines, pick(finalRespondChallengePool)],
  };
}

// ---------- Weak judgments (score 1) ----------
// Short, oral verdicts — examiner stopping you, not UI labels.

const weakJudgmentPool: readonly string[] = [
  "No — not to standard.",
  "That doesn't pass.",
  "I'm stopping you there.",
  "Not acceptable for this ride.",
  "Too general — I need the full sequence, in order.",
  "That answer doesn't hold up.",
  "We're not there yet.",
];

// ---------- Adequate judgments (score 2) ----------

const adequateJudgmentPool: readonly string[] = [
  "Incomplete — not yet.",
  "Not to standard. Close, but no.",
  "That's thin for what I'm grading.",
  "Not quite — I need more on the table.",
  "Still short of the bar.",
];

// ---------- Pass judgments (score 3) ----------

const passJudgmentPool: readonly string[] = [
  "Satisfactory.",
  "That meets the standard.",
  "Good — that's what I needed.",
  "Yes. That holds.",
  "Fine. That'll do.",
];

// ---------- Adequate pressure per item (score 2) — short spoken ----------

const adequatePressurePool: Record<string, readonly string[]> = {
  "lost-comms-vfr": [
    "I hear what you're aiming at, but the order's wrong — I can't pass that, and I'm not pretending I can.",
    "Right ingredients, wrong recipe. On the ride I don't get to coach you through the sequence.",
    "You're giving me pieces; I need the stack I'd actually brief — flyable, in order.",
  ],
};

const passPressurePool: readonly string[] = [
  "That's ride-ready — clear and in order.",
  "Yeah. That's what I was listening for.",
  "Clean. I'd sign off on that.",
  "Okay. That works.",
];

const passCloserPool: readonly string[] = [
  "Good. Next item.",
  "All right — next one.",
  "We're done here. Move on.",
  "Let's go to the next scenario.",
];

const retryPushLostComms: readonly string[] = [
  "Back up — same question. First action, out loud, no shortcuts.",
  "Clean retake from the top of the stack. I'm not letting you slide on order.",
  "You're doing it again — start over and don't skip anything I need to hear.",
];

/**
 * Opens the miss debrief: standard not met, examiner still in control.
 * (Judgment headline already landed; this carries the table tension forward.)
 */
const missStandardFramePool: readonly string[] = [
  "That's not to standard.",
  "I'm scoring that as a miss.",
  "You didn't give me a pass-level answer.",
  "Listen — I'm not moving on for free.",
];

/**
 * Final beat: unmistakable push to answer again (tension → action).
 */
const finalRespondChallengePool: readonly string[] = [
  "Same question — you're up. Answer it again.",
  "Try again — full answer, no hedging.",
  "We stay here until this is passable.",
  "Back to the mic.",
  "That's the gap — from the top.",
];

const weakPressurePool: Record<string, readonly string[]> = {
  "lost-comms-vfr": [
    "You jumped to the end before you set the failure up — I'm not signing off on that.",
    "Out of order. I can't credit what I'm hearing, and I'm not going to bluff that I did.",
    "You reached for landing before you squared the comm loss — that's a hard no from me.",
  ],
};

const weakPressureFallback: readonly string[] = [
  "For the bar I'm holding you to, that's not there yet.",
  "I'm not trying to be cute — I need a full answer.",
  "Under oral pressure that still folds. Tighten it.",
  "Bring it back — I'm listening for structure, not vibes.",
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
    const gapLines = gapLinesFromTopMisses(missed.slice(0, 2)).slice(0, 1);
    return {
      judgment: pick(adequateJudgmentPool),
      examinerNote: "",
      spokenBeats: [
        pick(missStandardFramePool),
        pressure,
        ...gapLines,
        pick(finalRespondChallengePool),
      ],
    };
  }

  const pressurePool = weakPressurePool[itemId] ?? weakPressureFallback;
  const pressure = pick(pressurePool);
  const gapLines = gapLinesFromTopMisses(missed.slice(0, 2)).slice(0, 1);
  return {
    judgment: pick(weakJudgmentPool),
    examinerNote: "",
    spokenBeats: [
      pick(missStandardFramePool),
      pressure,
      ...gapLines,
      pick(finalRespondChallengePool),
    ],
  };
}

/** Trim and drop empty beats. */
export function compactSpokenBeats(beats: readonly string[]): readonly string[] {
  return beats.map((s) => s.trim()).filter((s) => s.length > 0);
}
