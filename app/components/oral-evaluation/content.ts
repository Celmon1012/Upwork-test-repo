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
 * Multiple oral items: one prompt at a time, with examiner-calibrated baseline copy.
 * Runtime evaluator logic in the experience component adapts verdict text to the submitted answer.
 */
export const ORAL_ITEMS: readonly OralItem[] = [
  {
    id: "preflight-prep",
    contextLabel: "Preflight preparation",
    promptLine: "Walk me through how you prepare for this flight before you untie the aircraft.",
    scenario:
      "VFR cross-country — Fort Lauderdale Executive to Orlando. Weather is MVFR at the destination at ETA, with improvement forecast after your arrival.",
    evaluation: {
      score: 2,
      outcomeLabel: "Incomplete",
      judgment: "Adequate — but not a complete oral answer",
      examinerNote:
        "I want a real preflight decision from you, not a list of apps you like. I still don’t see how you’d actually run this trip.",
      correct: [
        "Weather and NOTAMs first — good, that’s the instinct I want on a cross-country.",
        "And you pulled the sectional for route orientation. Tells me you’re thinking in chart space, not just GPS.",
      ],
      missed: [
        "But performance, weight and balance, runway analysis — I had to drag all of that out of you. On a checkride I shouldn’t.",
        "Fuel with reserve, alternates, a clean go/no-go tied to all that — you left it implied. On the ride I need it said out loud.",
      ],
      stronger:
        "Here’s what I want. IMSAFE, then weather and NOTAMs in enough depth to defend a go/no-go. Then route, performance, W&B, runway choices, fuel with reserve, alternates, and TFRs or special use. In that order. And if I cut in with a what-if, you should still know where you are in it.",
      why: "I’m not after flashcards. I want to see you run a real preflight brief — the way you’d brief it with another pilot sitting right there.",
      deeperExplanation: [
        "Think of preflight as a chain. Each link is a decision — pilot, weather, aircraft, route, fuel, alternates — and each one earns the next.",
        "If you skip performance, I can’t trust your go/no-go. If you gloss weather, I can’t trust your route pick. That’s why the order matters out loud.",
        "I’m not grading recall. I’m grading whether you can defend the trip under questioning.",
      ],
    },
  },
  {
    id: "lost-comms-vfr",
    contextLabel: "Lost communications",
    promptLine: "You’ve lost two-way radio communication in VFR conditions. What do you do, and in what order?",
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
  {
    id: "stall-spin",
    contextLabel: "Stalls and slow flight",
    promptLine:
      "Tell me how you recognize an approach to stall in this aircraft, and what your recovery looks like.",
    scenario:
      "Training aircraft, clean or configured for landing — I want your cues and your priorities, not a paragraph from a manual.",
    evaluation: {
      score: 3,
      outcomeLabel: "Satisfactory",
      judgment: "Satisfactory — I’d sign this",
      examinerNote:
        "Cues, priorities, and a recovery I can picture you actually flying. That’s what I want out of this oral.",
      correct: [
        "You tied buffet, control feel, and nose attitude to energy decay. Not just airspeed in isolation. Good.",
        "And the recovery order was right. Reduce angle of attack first, power as appropriate, wings level, back to altitude.",
      ],
      missed: [
        "One thing I’d still tighten — coordinated flight on the entry and the recovery. That’s where spins come from, and I want to hear you say it.",
      ],
      stronger:
        "Keep tying stall back to angle of attack. I can stall at any airspeed if I ask the wing for too much. Then walk recovery as a reflex — unload, power, configure, climb back to assignment.",
      why: "This isn’t trivia. It’s whether you respect where the airplane gives up, and whether you’ll recover without improvising under stress.",
      deeperExplanation: [
        "Angle of attack is the variable. Airspeed is just a proxy. A pilot who can’t articulate that under pressure treats recovery as a recipe, not a reflex.",
        "The first move is always the same — unload the wing. Then power. Then configuration. Then back to the assignment. Same order, every time.",
        "And coordination — that’s the line between a stall and a spin. Ball in the middle on the entry, ball in the middle on the recovery. Say it, mean it.",
      ],
    },
  },
  {
    id: "night-currency",
    contextLabel: "Night currency",
    promptLine: "Are you legal to carry passengers for night VFR tonight? Prove it from your logbook logic.",
    scenario:
      "Night landing currency under 61.57(b) — assume sunset was three hours ago and you haven’t flown at night in six weeks.",
    evaluation: {
      score: 2,
      outcomeLabel: "Adequate",
      judgment: "Adequate — rules are there, application is loose",
      examinerNote:
        "You’re in the right regulation. But I need tighter coupling — the definition of night, the landings and takeoffs, and the 90-day window all talking to each other.",
      correct: [
        "You got to 61.57 for passenger carrying. That’s the right hook.",
        "And you knew we’re talking full-stop landings in the same category and class. Good.",
      ],
      missed: [
        "But the night definition — end of evening civil twilight — and how that bounds your landings? That never came out clean.",
        "And the 90-day window, what counts inside it, that needed to be explicit. Not implied.",
      ],
      stronger:
        "A complete answer sounds like this. State the regulation. Define night for those landings. State the number and type of operations. Then place yourself inside or outside the 90-day window with dates I can follow.",
      why: "I ask currency questions to find out whether you treat legality as paperwork, or as something you can defend with numbers.",
      deeperExplanation: [
        "61.57(b) is narrow and specific. Three full-stop landings, at night, same category and class, in the preceding 90 days. All four pieces, or no passengers.",
        "Night for those landings means end of evening civil twilight — not sunset. Get the definition wrong and the rest of the math doesn’t matter.",
        "I don’t want a recitation. I want dates, times, and a conclusion I can hold you to.",
      ],
    },
  },
  {
    id: "crosswind-gusts",
    contextLabel: "Crosswind landing",
    promptLine:
      "Gusty crosswind on landing — how do you set up, what are you managing on short final, and what are your personal limits?",
    scenario:
      "Direct crosswind component pushing the limits of your demonstrated capability in the POH — I want technique and judgment, not just ‘I’d go around.’",
    evaluation: {
      score: 1,
      outcomeLabel: "Insufficient depth",
      judgment: "Not enough depth for these conditions",
      examinerNote:
        "That was generic crosswind talk. For gusty, limiting conditions I want wheel technique, energy management, and a clear abort philosophy. Not slogans.",
      correct: [
        "Crab-to-sideslip, or the stabilized sideslip idea — directionally right. I’ll take that.",
        "And you named going around when the picture isn’t there. Good instinct.",
      ],
      missed: [
        "But gust spread, adding airspeed judiciously, upwind wheel first on touchdown — none of that came out.",
        "And personal limits versus book limits. You didn’t give me a boundary I can hold you to.",
      ],
      stronger:
        "Here’s what I want. Stabilized approach criteria. Crosswind component against your training and the POH. Rudder and aileron plan into the flare. Touchdown technique. And when you walk away — with numbers, or clear personal gates.",
      why: "Crosswind days separate recipe answers from real pilot judgment. I want to hear you brief yourself out of a bad touchdown before you’re sideways in the flare.",
      deeperExplanation: [
        "Crosswind technique is energy management plus commitment. Stabilized on speed, aligned with the runway, ready to either land it or leave it.",
        "Upwind wheel first on the touchdown. Aileron into the wind. Rudder to hold centerline. The airplane doesn’t care what you wanted — it cares what you do.",
        "And personal limits. Numbers, not feelings. If the gust spread crosses your line, you go around. That’s the answer I want to hear.",
      ],
    },
  },
] as const;

/** Deliberate pause between response and examiner record. */
export const EVALUATING_MS = 1500;
