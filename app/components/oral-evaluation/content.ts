/** Oral checkride evaluator — content only (frontend mock). Tone: DPE across the table, not product UI. */

export const UI = {
  /** Minimal chrome; presence comes from the prompt, not branding. */
  oralEvaluation: "Oral examination",
} as const;

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
};

export type OralItem = {
  id: string;
  /** Shown as subtle context — topic area, not a nav label. */
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
    contextLabel: "Flight planning · preflight preparation",
    promptLine: "Walk me through how you prepare for this flight before you untie the aircraft.",
    scenario:
      "VFR cross-country — Fort Lauderdale Executive to Orlando. Weather is MVFR at the destination at ETA, with improvement forecast after your arrival.",
    evaluation: {
      score: 2,
      outcomeLabel: "Incomplete",
      judgment: "Adequate, but incomplete for the oral",
      examinerNote:
        "I’m listening for a complete preflight decision — not a list of apps you like. I still don’t have a full picture of how you’d run this trip.",
      correct: [
        "You started with weather and NOTAMs — that’s the right instinct for a cross-country brief.",
        "You referenced the sectional for route orientation; that tells me you’re thinking in chart space, not just GPS.",
      ],
      missed: [
        "Performance, weight and balance, and runway analysis never came out in an organized way — I shouldn’t have to drag that out of you.",
        "Fuel with reserve, alternates, and a clear go/no-go tied to those constraints stayed implied. On the ride I need explicit.",
      ],
      stronger:
        "I want IMSAFE, then weather and NOTAMs in enough depth to defend a go/no-go, then route, performance and W&B, runway choices, fuel with reserve, alternates, and TFRs or special use — in an order I can follow. If I interrupt with a what-if, you should still know where you are in that picture.",
      why: "I’m not testing flashcards. I’m testing whether you can run a disciplined preflight briefing the way you’d brief a safety-critical go/no-go with another pilot in the room.",
    },
  },
  {
    id: "lost-comms-vfr",
    contextLabel: "Regulations · lost communications",
    promptLine: "You’ve lost two-way radio communication in VFR conditions. What do you do, and in what order?",
    scenario:
      "Class E surface area, you’re VFR, flight following dropped out after your last acknowledgment. You’re not IFR.",
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — the sequence isn’t there yet",
      examinerNote:
        "I heard pieces of 91.185, but I don’t have confidence you could execute this cold on the ramp without me coaching the order.",
      correct: [
        "You identified that 91.185 governs equipment and route — that’s the right anchor.",
        "You mentioned squawking 7600 — that belongs in the conversation for lost comms.",
      ],
      missed: [
        "ATC route, last assigned, expected, filed — you didn’t walk me through that stack in a way I could grade.",
        "Altitude: last assigned, minimum en route, expected, and when to use MEA — that part never landed as a sequence.",
      ],
      stronger:
        "Squawk 7600, then fly the route you’re supposed to fly under 91.185 in order — ATC route, last assigned, expected, filed — and altitude in the same priority. I should hear it like a checklist you’ve briefed before, not like you’re discovering it in the chair.",
      why: "On the ride I’ll hand you a lost-comms scenario and watch whether you can verbalize a defensible, regulation-backed plan. Partial recall isn’t enough when the radios go quiet.",
    },
  },
  {
    id: "stall-spin",
    contextLabel: "Operations · slow flight and stalls",
    promptLine:
      "Tell me how you recognize an approach to stall in this aircraft, and what your recovery looks like.",
    scenario:
      "Training aircraft, clean or configured for landing — I want your cues and your priorities, not a paragraph from a manual.",
    evaluation: {
      score: 3,
      outcomeLabel: "Satisfactory",
      judgment: "Satisfactory — I’d sign this segment",
      examinerNote:
        "You gave me cues, priorities, and a recovery I can picture you executing. That’s what I’m looking for in the oral.",
      correct: [
        "You tied buffet, control feel, and nose attitude to the decay of energy — not just airspeed in isolation.",
        "Recovery: reduce angle of attack first, then add power as appropriate, roll wings level, return to assigned altitude — priorities were right.",
      ],
      missed: [
        "I’d still want a cleaner mention of maintaining coordinated flight on the entry and recovery — that’s where spins come from.",
      ],
      stronger:
        "Keep tying stall to angle of attack explicitly: I can stall at any airspeed if I ask the wing for too much. Then walk recovery as a reflex: unload, power, configure, climb back to the assignment.",
      why: "Stall and spin knowledge isn’t trivia — it’s whether you respect where the airplane gives up and whether you’ll recover without improvising under stress.",
    },
  },
  {
    id: "night-currency",
    contextLabel: "Currency and logging",
    promptLine: "Are you legal to carry passengers for night VFR tonight? Prove it from your logbook logic.",
    scenario:
      "Night landing currency under 61.57(b) — assume sunset was three hours ago and you haven’t flown at night in six weeks.",
    evaluation: {
      score: 2,
      outcomeLabel: "Adequate",
      judgment: "Adequate — rules are there, application is loose",
      examinerNote:
        "You’re in the right regulation, but I need tighter coupling between definition of night, takeoffs and landings, and the calendar window.",
      correct: [
        "You pointed at 61.57 for passenger carrying — correct hook.",
        "You understood we’re talking takeoffs and landings to a full stop in the same category and class.",
      ],
      missed: [
        "Night definition (end of evening civil twilight) and how that bounds your landings didn’t come out crisply.",
        "The 90-day window and what counts inside it needed to be explicit, not implied.",
      ],
      stronger:
        "State the regulation, define night for the purpose of those landings, state the number and type of operations, and place yourself inside or outside the 90-day window with dates I can follow. That’s a complete oral answer.",
      why: "I’ll ask currency questions when I’m deciding whether you treat legality as a paperwork detail or as something you can defend with numbers.",
    },
  },
  {
    id: "crosswind-gusts",
    contextLabel: "Performance and technique",
    promptLine:
      "Gusty crosswind on landing — how do you set up, what are you managing on short final, and what are your personal limits?",
    scenario:
      "Direct crosswind component pushing the limits of your demonstrated capability in the POH — I want technique and judgment, not just ‘I’d go around.’",
    evaluation: {
      score: 1,
      outcomeLabel: "Insufficient depth",
      judgment: "Insufficient depth for the conditions described",
      examinerNote:
        "I heard generic crosswind talk. For gusty, limiting conditions I need wheel technique, energy, and a clear abort philosophy — not slogans.",
      correct: [
        "You mentioned crab-to-side slip or a stabilized sideslip mindset — that’s directionally right.",
        "You acknowledged going around when the picture isn’t there — good instinct to name.",
      ],
      missed: [
        "No real discussion of gust spread, adding airspeed judiciously, or touchdown on the upwind wheel first in a crosswind.",
        "Personal limits vs book limits — I didn’t get a boundary I could hold you to.",
      ],
      stronger:
        "I want stabilized approach criteria, crosswind component vs your training and POH, rudder and aileron strategy into flare, touchdown technique, and when you walk away — with numbers or clear personal gates.",
      why: "Crosswind days separate recipe answers from pilot judgment. I’m listening for whether you’d brief yourself out of a bad touchdown before you’re sideways in the flare.",
    },
  },
] as const;

/** Deliberate pause between response and examiner record. */
export const EVALUATING_MS = 2000;
