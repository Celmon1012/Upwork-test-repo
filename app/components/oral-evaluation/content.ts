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
  /** Short scene context only (e.g. "Preflight preparation") — not a course breadcrumb. */
  contextLabel: string;
  /** One clear ask; how a DPE opens the item. */
  promptLine: string;
  /** Scenario grounding — aircraft, route, or condition. */
  scenario: string;
  evaluation: EvaluationBlock;
  /**
   * Static, per-question strong sample answer shown via "Show Me Answer".
   * Each entry is one clean, standalone line — checkride-ready, no explanation.
   */
  sampleAnswer: readonly string[];
};

/**
 * Phase 2: multiple oral scenarios. Runtime scoring and examiner copy live in
 * `OralEvaluationExperience` + `examiner-scripts`.
 */
export const ORAL_ITEMS: readonly OralItem[] = [
  {
    id: "lost-comms-vfr",
    contextLabel: "Lost communications",
    promptLine:
      "You've lost two-way radio communication in VFR conditions. What do you do, and in what order?",
    scenario:
      "Class E surface area, you're VFR, flight following dropped out after your last acknowledgment. You're not IFR.",
    sampleAnswer: [
      "Squawk 7600.",
      "Continue VFR — proceed to the nearest suitable airport.",
      "Fly the 91.185 route stack: assigned route first, then expected, then filed.",
      "Altitude: fly the highest of assigned, MEA, or expected.",
    ],
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — the sequence isn't there",
      examinerNote:
        "I heard pieces of 91.185 in there. But I don't think you could execute this cold on the ramp without me walking you through the order.",
      correct: [
        "You got to 91.185 — that's your anchor, and you found it.",
        "You mentioned 7600. Fine. That belongs in this conversation.",
      ],
      missed: [
        "But the route priority — assigned, expected, filed — you didn't walk me through that stack in a way I can grade.",
        "Same on altitude. Assigned, MEA, expected, and when you take the highest of them. That never came out as a sequence.",
      ],
      stronger:
        "Here's what I want. Squawk 7600. Then fly the route under 91.185 in order — assigned, expected, filed — and altitude in the same priority. It should sound like a checklist you've briefed a hundred times, not like you're figuring it out in the chair.",
      why: "On the ride I'll hand you a lost-comms scenario and just watch what comes out. Partial recall doesn't cut it when the radios go quiet.",
      deeperExplanation: [
        "91.185 is written as a priority list for a reason. When the radios go quiet, you don't have time to re-derive it — you execute it.",
        "Route priority: assigned, expected, filed. Altitude priority: the highest of assigned, MEA, expected. Memorize the shape, not just the words.",
        "And 7600 first. Before anything else. ATC can't help you if they don't know you're lost.",
      ],
    },
  },
  {
    id: "weather-briefing-go-no-go",
    contextLabel: "Weather briefing",
    promptLine:
      "Before departure, how do you brief weather and make a go/no-go decision?",
    scenario:
      "Cross-country in a normally aspirated single. Ceiling and visibility are trending down along the route.",
    sampleAnswer: [
      "Start with METARs, TAFs, radar, and winds aloft for departure, en route, and destination.",
      "Identify ceilings, visibility, convection, icing, and wind risk against personal minimums.",
      "Set clear divert points and alternates before takeoff.",
      "If trends or margins are not acceptable, no-go is the correct decision.",
    ],
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — your weather logic is incomplete",
      examinerNote:
        "You gave some weather terms, but your risk decision chain was not clear enough to trust under pressure.",
      correct: [],
      missed: [
        "I need a structured weather scan, not just random products.",
        "You must tie weather directly to a go/no-go decision and alternates.",
      ],
      stronger:
        "Brief weather in sequence: products, hazards, margins, and decision. Then state your go/no-go call clearly.",
      why: "The checkride is about judgment under uncertainty, not memorizing acronyms.",
      deeperExplanation: [
        "Always connect data to action. If weather degrades, what exactly changes in your plan?",
        "Personal minimums are only useful if they are explicit before you launch.",
      ],
    },
  },
  {
    id: "notams-and-airspace-brief",
    contextLabel: "NOTAMs and airspace",
    promptLine:
      "Walk me through how you'll review NOTAMs and airspace restrictions before this flight.",
    scenario:
      "Planned route crosses multiple controlled segments near a stadium TFR area.",
    sampleAnswer: [
      "Review NOTAMs for departure, destination, alternate, and route fixes.",
      "Check for TFRs, runway closures, nav aid outages, and special use airspace status.",
      "Verify route legality through each airspace segment and required communication/equipment.",
      "If a restriction blocks the plan, revise route and brief the new path before departure.",
    ],
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — restrictions were not fully controlled",
      examinerNote:
        "You touched the idea of NOTAMs, but I did not hear a complete legal/operational airspace brief.",
      correct: [],
      missed: [
        "NOTAM review must be explicit for all critical airports and route points.",
        "Airspace legality must be confirmed, not assumed.",
      ],
      stronger:
        "State the NOTAM scan path, identify hard restrictions, and show the legal route decision.",
      why: "Airspace and NOTAM misses create immediate checkride and operational risk.",
      deeperExplanation: [
        "Treat TFRs and closures as hard constraints first, then optimize route.",
        "Always verbalize the fallback route if the preferred one closes.",
      ],
    },
  },
  {
    id: "runway-performance-assessment",
    contextLabel: "Performance and runway",
    promptLine:
      "How do you determine if the selected runway is suitable for today's takeoff?",
    scenario:
      "High-density-altitude afternoon with a moderate tailwind on the preferred runway.",
    sampleAnswer: [
      "Calculate takeoff performance with current weight, pressure altitude, temperature, and wind.",
      "Apply runway surface, slope, and obstacle corrections from the POH data.",
      "Compare required distance with available runway plus a conservative safety margin.",
      "If margin is not acceptable, reduce weight, delay, or choose another runway/airport.",
    ],
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — performance decision not defensible yet",
      examinerNote:
        "You gave general performance language, but I did not hear a concrete accept/reject runway decision method.",
      correct: [],
      missed: [
        "I need explicit variables and corrections, not a general statement.",
        "You must state a clear safety margin and reject criteria.",
      ],
      stronger:
        "Compute, correct, compare, decide — then state your mitigation if margins are weak.",
      why: "Runway suitability is a hard go/no-go gate, especially in high DA conditions.",
      deeperExplanation: [
        "Performance math only matters if you use a firm operational margin.",
        "Tailwind and obstacles can erase runway margin quickly.",
      ],
    },
  },
  {
    id: "weight-balance-fuel-plan",
    contextLabel: "Weight, balance, fuel",
    promptLine:
      "Show me how you verify weight and balance, then fuel planning, before release.",
    scenario:
      "Full passenger load, near max gross, with forecast headwinds stronger than planned.",
    sampleAnswer: [
      "Compute weight and CG using actual passenger, baggage, and fuel loads.",
      "Confirm both gross weight and CG remain within envelope for all flight phases.",
      "Plan fuel for taxi, trip, reserve, and realistic headwind/contingency corrections.",
      "If CG, weight, or fuel margins are weak, offload, adjust route, or delay departure.",
    ],
    evaluation: {
      score: 1,
      outcomeLabel: "Partial",
      judgment: "Partial — planning sequence had gaps",
      examinerNote:
        "I heard pieces, but not a complete weight/balance plus fuel decision workflow I can sign off on.",
      correct: [],
      missed: [
        "You must confirm envelope compliance, not only total weight.",
        "Fuel planning needs explicit reserves and wind-adjusted margins.",
      ],
      stronger:
        "Run W&B and fuel as a single risk package, then state the accept/reject decision.",
      why: "This is where planning errors compound into in-flight emergencies.",
      deeperExplanation: [
        "CG limits are as critical as gross weight for controllability.",
        "Fuel planning must include realistic winds and contingency, not optimistic numbers.",
      ],
    },
  },
] as const;

/** Phase 1 target think window (ms); actual delay is randomized in the experience. */
export const EVALUATING_MS = 1500;
