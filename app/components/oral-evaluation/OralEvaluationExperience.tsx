"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ORAL_ITEMS,
  type EvaluationBlock,
  type OralItem,
  type ScoreValue,
} from "./content";
import {
  buildExaminerSpokenTurn,
  compactSpokenBeats,
} from "./examiner-scripts";

type SessionPhase = "respond" | "evaluating" | "feedback";
type RubricPoint = { label: string; keywords: readonly string[] };

const cinematicEase = [0.16, 1, 0.3, 1] as const;

/** Phase 2: scenario rubrics for 0–3 scoring. */
const rubricByItem: Record<string, readonly RubricPoint[]> = {
  "lost-comms-vfr": [
    { label: "7600", keywords: ["7600", "transponder", "squawk"] },
    { label: "route stack", keywords: ["assigned", "expected", "filed", "route"] },
    { label: "altitude stack", keywords: ["mea", "minimum", "altitude", "highest"] },
    { label: "91.185", keywords: ["91.185", "regulation", "rule"] },
    { label: "clear order", keywords: ["first", "then", "order", "sequence"] },
  ],
  "weather-briefing-go-no-go": [
    { label: "weather sources", keywords: ["metar", "taf", "radar", "winds aloft"] },
    { label: "hazard assessment", keywords: ["ceiling", "visibility", "icing", "convection", "thunderstorm"] },
    { label: "go/no-go logic", keywords: ["go", "no-go", "decision", "personal minimum"] },
    { label: "alternate plan", keywords: ["alternate", "divert", "plan b"] },
    { label: "clear sequence", keywords: ["first", "then", "next", "sequence"] },
  ],
  "notams-and-airspace-brief": [
    { label: "NOTAM coverage", keywords: ["notam", "departure", "destination", "alternate"] },
    { label: "restriction check", keywords: ["tfr", "closure", "outage", "restriction"] },
    { label: "airspace legality", keywords: ["airspace", "class", "legal", "clearance"] },
    { label: "route adjustment", keywords: ["reroute", "revise", "change route", "avoid"] },
    { label: "communication/equipment", keywords: ["comms", "radio", "transponder", "equipment"] },
  ],
  "runway-performance-assessment": [
    { label: "performance inputs", keywords: ["weight", "altitude", "temperature", "wind"] },
    { label: "POH corrections", keywords: ["poh", "surface", "slope", "obstacle"] },
    { label: "distance comparison", keywords: ["required distance", "available runway", "margin"] },
    { label: "runway suitability decision", keywords: ["suitable", "unsuitable", "accept", "reject"] },
    { label: "mitigation", keywords: ["reduce weight", "delay", "another runway", "another airport"] },
  ],
  "weight-balance-fuel-plan": [
    { label: "weight and CG", keywords: ["weight", "cg", "center of gravity", "envelope"] },
    { label: "envelope compliance", keywords: ["within limits", "max gross", "limits"] },
    { label: "fuel components", keywords: ["taxi", "trip", "reserve", "contingency"] },
    { label: "wind adjustment", keywords: ["headwind", "wind correction", "extra fuel"] },
    { label: "final go/no-go", keywords: ["go", "no-go", "offload", "delay"] },
  ],
};

function transitionMs(reduce: boolean | null, ms: number) {
  return reduce ? 0 : ms;
}

/** Short disposition line — shown alone before any supporting copy. */
function verdictLine(score: ScoreValue, teaching: boolean = false): string {
  if (teaching) return "Here's what I want.";
  if (score >= 3) return "Satisfactory.";
  return "Not sufficient.";
}

const SCORE_MEANING: Record<ScoreValue, string> = {
  0: "Off-target or no usable answer",
  1: "Weak / fragmented (partial knowledge, poor structure)",
  2: "Adequate but incomplete (misses 1–2 important items)",
  3: "Complete, checkride-ready answer",
};

/*
 * Oral-room presentation (not "just UI"): these timings and motion choices
 * are how the examiner *feels* — verdict weight, silence, when the next
 * line is allowed to land. Backend copy can stay fixed; this layer shapes
 * checkride-like rhythm on the client.
 */

/**
 * Verdict hold before the first spoken beat after the headline judgment.
 *
 * Deliberately uneven: usually the room lets the verdict sit, sometimes the
 * examiner cuts in early, sometimes they wait too long. Misses get a bit more
 * air than a pass so the headline reads as a real oral moment.
 */
function explanationRevealDelayMs(
  reduce: boolean | null,
  score: ScoreValue,
  teaching: boolean,
): number {
  if (reduce) return teaching ? 640 : 920;
  if (teaching) return 460 + Math.floor(Math.random() * 220);
  const roll = Math.random();
  // ~11% — cuts in early (still happens, but verdict usually gets the room).
  if (roll < 0.11) return 300 + Math.floor(Math.random() * 240);
  // ~17% — uncomfortable hold before they start talking at you.
  if (roll < 0.28) return 2080 + Math.floor(Math.random() * 780);
  const jitter = Math.floor(Math.random() * 420);
  if (score <= 1) return 1260 + jitter;
  if (score === 2) return 1100 + jitter;
  return 760 + jitter;
}

/**
 * Subtle divider / ambient reveal delay under the verdict.
 * Held until the end of the verdict-solo window so nothing
 * competes with the verdict while it lands.
 */
function judgmentFollowDelayS(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 1.0;
  if (score <= 1) return 1.38;
  if (score === 2) return 1.2;
  return 1.0;
}

/**
 * Inter-segment pause between spoken explanation parts (frontend-only pacing).
 *
 * Three moods, re-rolled per gap so rhythm varies line to line:
 *   - "cut-in" (~24%): next line lands soon after the previous.
 *   - "long hold" (~18%): uncomfortable wait before the next line.
 *   - "normal" (~58%): readable beat, length-sensitive + jitter.
 *
 * Fade-in duration for each line stays fixed elsewhere — only the *wait*
 * before the next line appears varies.
 */
function segmentRevealDelayMs(segmentText: string, reduce: boolean | null): number {
  if (reduce) return 420;
  const roll = Math.random();
  if (roll < 0.24) {
    return 280 + Math.floor(Math.random() * 380);
  }
  if (roll < 0.42) {
    const readRoom = Math.min(1300, Math.floor(segmentText.length * 10));
    return 2200 + readRoom + Math.floor(Math.random() * 900);
  }
  const base = 980;
  const readRoom = Math.min(1100, Math.floor(segmentText.length * 8));
  const jitter = Math.floor(Math.random() * 640);
  return base + readRoom + jitter;
}

/**
 * Reading dwell after the examiner has fully delivered the spoken feedback.
 *
 * Phase 1: long enough to read and sit with the moment, short enough that
 * question → answer → feedback → next still feels like one continuous oral.
 * Lower scores get a touch more dwell. Light jitter avoids a metronome feel.
 */
function readingDwellAfterSpeechMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 12000;
  const jitter = Math.floor(Math.random() * 1600);
  if (score <= 1) return 16800 + jitter;
  if (score === 2) return 14800 + jitter;
  return 12800 + jitter;
}

/**
 * Phase 1: fixed examiner "think" window after typed submit — 1–2 seconds
 * before the judgment and spoken beats appear (no snap / long-tail modes).
 */
function examinerThinkingPauseMs(reduceMotion: boolean | null): number {
  if (reduceMotion) return 1400;
  return 1000 + Math.floor(Math.random() * 1001);
}

/** Content panel — glass card that all evaluation text lives inside. */
const ATMOSPHERE_PANEL =
  "oral-glass-panel px-6 py-6 sm:px-8 sm:py-8";

/** Secondary links — visible but not competing with examiner copy. */
const FOOTER_WHISPER =
  "rounded-sm border-0 bg-transparent p-0 text-left font-serif text-[0.74rem] font-light italic tracking-[0.006em] text-white/50 outline-none transition-[color] duration-200 ease-out hover:text-white/75 focus-visible:text-white/85 focus-visible:ring-1 focus-visible:ring-white/20";

export function OralEvaluationExperience() {
  const reduceMotion = useReducedMotion();
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [itemIndex, setItemIndex] = useState(0);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [evaluated, setEvaluated] = useState<EvaluationBlock | null>(null);
  const [revealedSegments, setRevealedSegments] = useState(0);
  const [showTransitionCue, setShowTransitionCue] = useState(false);
  const [showThinkingCue, setShowThinkingCue] = useState(false);
  const [justReceived, setJustReceived] = useState(false);
  const [markedItems, setMarkedItems] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [sessionDone, setSessionDone] = useState(false);
  const [fromReview, setFromReview] = useState(false);

  const [showMeMode, setShowMeMode] = useState(false);
  // Gated reveal of the strong sample answer block.
  // Never open by default — the user has to ask for it.
  const [showAnswer, setShowAnswer] = useState(false);
  /** While true, bookmark + feedback actions stay hidden so the sample answer can land alone. */
  const [answerRevealChromeHidden, setAnswerRevealChromeHidden] =
    useState(false);
  /** Increments each Try again on the same item — sharper examiner copy on repeat miss. */
  const [oralRepeatMissCount, setOralRepeatMissCount] = useState(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();
  const evaluationTimerRef = useRef<number | null>(null);

  const item = ORAL_ITEMS[itemIndex]!;
  const evaluation = evaluated ?? item.evaluation;
  const explanationSegments = useMemo(
    () => composeExplanationSegments(evaluation, showMeMode),
    [evaluation, showMeMode],
  );
  // Per-segment reveal duration — uniform across all lines and all responses.
  // Variation lives in the *pauses between* lines (see segmentRevealDelayMs),
  // not in how long each line takes to fade in.
  const SEGMENT_FADE_SECONDS = 0.88;
  const segmentDurations = useMemo(
    () => explanationSegments.map(() => SEGMENT_FADE_SECONDS),
    [explanationSegments],
  );
  const segmentCount = explanationSegments.filter((s) => s.trim().length > 0)
    .length;
  const allSegmentsRevealed =
    segmentCount === 0 ? true : revealedSegments >= segmentCount;

  // Static sample answer lines — used by "Show Me Answer" after evaluation.
  // Pulled directly from item.sampleAnswer (clean, per-question, no mixing).
  const sampleAnswerLines = useMemo(
    () => item.sampleAnswer.slice(),
    [item],
  );

  const runEvaluation = useCallback(() => {
    const answer = answerRef.current?.value.trim() ?? "";
    if (!answer) {
      setAnswerError("Nothing there yet.");
      answerRef.current?.focus();
      return;
    }
    if (evaluationTimerRef.current) {
      window.clearTimeout(evaluationTimerRef.current);
      evaluationTimerRef.current = null;
    }
    setAnswerError(null);
    const block = evaluateAnswer(item, answer, oralRepeatMissCount);
    setEvaluated(block);
    if (block.score >= 3) setOralRepeatMissCount(0);
    setShowMeMode(false);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setSessionPhase("evaluating");
    const pauseMs = examinerThinkingPauseMs(reduceMotion);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [item, oralRepeatMissCount, reduceMotion]);

  // Skip answering — go straight to the examiner showing you a strong answer.
  // Same environmental pacing, shorter think-pause (they aren't grading).
  const runShowMe = useCallback(() => {
    if (evaluationTimerRef.current) {
      window.clearTimeout(evaluationTimerRef.current);
      evaluationTimerRef.current = null;
    }
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(true);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setOralRepeatMissCount(0);
    setSessionPhase("evaluating");
    const pauseMs = reduceMotion
      ? 1400
      : 1000 + Math.floor(Math.random() * 1001);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [reduceMotion]);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    if (answerRef.current) answerRef.current.value = "";
    setOralRepeatMissCount(0);
    if (fromReview) {
      setFromReview(false);
      setSessionDone(true);
    } else if (itemIndex >= ORAL_ITEMS.length - 1) {
      setSessionDone(true);
    } else {
      setItemIndex((i) => i + 1);
    }
  }, [fromReview, itemIndex]);

  // The pushback. Same question, cleared textarea, focus restored.
  // The examiner isn't giving up the answer — they're making the user talk again.
  const tryAgain = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    if (answerRef.current) answerRef.current.value = "";
    setOralRepeatMissCount((n) => n + 1);
    // itemIndex intentionally unchanged — same item, another pass.
  }, []);

  const toggleMark = useCallback(() => {
    setMarkedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, [item.id]);

  // Mark current item for later and immediately move on — no confirmation.
  const reviewLater = useCallback(() => {
    setMarkedItems((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    advanceFromFeedback();
  }, [advanceFromFeedback, item.id]);

  // Jump to a specific item from the end-of-session review screen.
  const startReviewItem = useCallback((id: string) => {
    const index = ORAL_ITEMS.findIndex((o) => o.id === id);
    if (index === -1) return;
    setItemIndex(index);
    setFromReview(true);
    setSessionDone(false);
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  // Restart entire session from question one.
  const startOver = useCallback(() => {
    setSessionDone(false);
    setFromReview(false);
    setItemIndex(0);
    setMarkedItems(new Set());
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

  useEffect(() => {
    setOralRepeatMissCount(0);
  }, [itemIndex]);

  /** Open: hide all chrome first, then show answer body; close: restore immediately. */
  const toggleAnswer = useCallback(() => {
    setShowAnswer((prev) => {
      if (prev) {
        setAnswerRevealChromeHidden(false);
        return false;
      }
      setAnswerRevealChromeHidden(true);
      return true;
    });
  }, []);

  // After "Show me the answer", keep bookmark + actions hidden until the
  // expanded block has had time to open and the last line has finished fading in.
  useEffect(() => {
    if (!showAnswer || !answerRevealChromeHidden || showMeMode) return;

    if (reduceMotion) {
      setAnswerRevealChromeHidden(false);
      return;
    }

    const n = sampleAnswerLines.length;
    if (n === 0) {
      setAnswerRevealChromeHidden(false);
      return;
    }

    // Match motion.div height (~0.55s) + label delay + last line delay + fade.
    // label at 0, lines staggered at 0.18 + index * 0.38 + 0.65s fade.
    const lastLineEndMs = (0.18 + (n - 1) * 0.38 + 0.65) * 1000;
    const totalMs = Math.round(550 + lastLineEndMs + 220);

    const id = window.setTimeout(() => {
      setAnswerRevealChromeHidden(false);
    }, totalMs);
    return () => window.clearTimeout(id);
  }, [
    answerRevealChromeHidden,
    sampleAnswerLines.length,
    item.id,
    reduceMotion,
    showAnswer,
    showMeMode,
  ]);

  useEffect(() => {
    if (sessionPhase === "respond") {
      answerRef.current?.focus();
    }
  }, [itemIndex, sessionPhase]);

  // Transient "answer received" beat — an environmental acknowledgement
  // that the examiner heard the response before beginning to think.
  useEffect(() => {
    if (!justReceived) return;
    const hold = 230 + Math.floor(Math.random() * 130);
    const timer = window.setTimeout(() => setJustReceived(false), hold);
    return () => window.clearTimeout(timer);
  }, [justReceived]);

  // Keyboard Enter follows the explicit Next Question action in Phase 2.
  const primaryAfterFeedback = useCallback(() => {
    advanceFromFeedback();
  }, [advanceFromFeedback]);

  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        if (showAnswer && answerRevealChromeHidden) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        primaryAfterFeedback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    allSegmentsRevealed,
    answerRevealChromeHidden,
    primaryAfterFeedback,
    sessionPhase,
    showAnswer,
  ]);

  useEffect(() => {
    return () => {
      if (evaluationTimerRef.current) {
        window.clearTimeout(evaluationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sessionPhase !== "feedback") return;
    const segments = explanationSegments.filter((s) => s.trim().length > 0);
    if (segments.length === 0) return;

    const timers: number[] = [];
    let cumulative = explanationRevealDelayMs(
      reduceMotion,
      evaluation.score,
      showMeMode,
    );
    for (let i = 0; i < segments.length; i++) {
      const index = i;
      timers.push(
        window.setTimeout(() => {
          setRevealedSegments(index + 1);
        }, cumulative),
      );
      if (i < segments.length - 1) {
        let gap = segmentRevealDelayMs(segments[i]!, reduceMotion);
        // Extra breath after the first pressure line on a miss — examiner
        // lets the first hit land before leaning in again.
        if (
          i === 0 &&
          evaluation.score < 3 &&
          !showMeMode &&
          segments.length > 1
        ) {
          gap += 200 + Math.floor(Math.random() * 280);
        }
        cumulative += gap;
      }
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    evaluation.score,
    explanationSegments,
    reduceMotion,
    sessionPhase,
    showMeMode,
  ]);

  // End-of-moment pacing.
  //
  // Phase 2: after feedback, the user chooses from explicit actions. We keep
  // only the soft wrap-up cue timing and remove timed auto-advance.
  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    // User opened the full model answer — stay with them.
    if (showAnswer) return;
    // Failed / incomplete — hold. No timed cue, no auto-advance. The "Your
    // move." cue is derived in render for this path so the user sees it
    // immediately; the room pressures through silence, not through the clock.
    if (evaluation.score < 3 && !showMeMode) return;

    const dwell = readingDwellAfterSpeechMs(reduceMotion, evaluation.score);
    const cueLead = reduceMotion
      ? 2400
      : 3200 + Math.floor(Math.random() * 700);
    const cueTimer = window.setTimeout(
      () => setShowTransitionCue(true),
      Math.max(0, dwell - cueLead),
    );
    return () => {
      window.clearTimeout(cueTimer);
    };
  }, [
    allSegmentsRevealed,
    evaluation.score,
    reduceMotion,
    sessionPhase,
    showAnswer,
    showMeMode,
  ]);

  if (sessionDone) {
    return (
      <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#0a1018]">
        <BackgroundStack phase="respond" justReceived={false} />
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
            <SessionEndScreen
              markedItems={markedItems}
              onRetryItem={startReviewItem}
              onStartOver={startOver}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#0a1018]">
      <BackgroundStack phase={sessionPhase} justReceived={justReceived} />

      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-visible px-4 py-3 sm:px-10 sm:py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              role="region"
              aria-label={item.contextLabel}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{
                duration: transitionMs(reduceMotion, 0.9),
                ease: cinematicEase,
              }}
              className="relative mx-auto flex min-h-0 w-full max-w-[min(88vw,50rem)] flex-col"
            >
            <div
              className={`oral-scrollbar-none relative z-[1] flex max-h-[88dvh] w-full flex-col overflow-y-auto overflow-x-hidden text-left ${ATMOSPHERE_PANEL}`}
            >
              {sessionPhase !== "feedback" ? (
                <motion.div
                  animate={{
                    opacity: evaluating ? 0.5 : 1,
                  }}
                  transition={{
                    duration: transitionMs(reduceMotion, 1.2),
                    ease: cinematicEase,
                  }}
                  style={{ zoom: 1.3 }}
                >
                  <h1 className="mt-1 font-serif text-[1.45rem] font-medium italic leading-[1.22] tracking-[0.01em] text-white sm:text-[1.65rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>

                  <p className="mt-4 max-w-[min(100%,30rem)] text-[0.82rem] font-light leading-[1.65] text-white/78 sm:text-[0.86rem]">
                    {item.scenario}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: transitionMs(reduceMotion, 0.55),
                    ease: cinematicEase,
                  }}
                  className="mt-1 max-w-[min(100%,30rem)]"
                >
                  <p className="text-[0.6rem] font-normal uppercase tracking-[0.26em] text-white/52">
                    {item.contextLabel}
                  </p>
                  <p className="mt-1.5 font-serif text-[0.82rem] font-light italic leading-[1.45] text-white/68 sm:text-[0.86rem]">
                    {`"${item.promptLine}"`}
                  </p>
                </motion.div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {showQuestionChrome ? (
                  <motion.div
                    key="answer-area"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{
                      duration: transitionMs(reduceMotion, 0.32),
                      ease: cinematicEase,
                    }}
                    className="mt-1 w-full pt-2"
                    style={{ zoom: 1.3 }}
                  >
                    <label htmlFor="oral-answer" className="sr-only">
                      Response to the examiner
                    </label>
                    {/* Writing-area — dims while examiner is thinking */}
                    <div
                      className={`oral-input-wrap relative mt-3 w-full transition-opacity duration-500 ease-out ${
                        evaluating ? "opacity-[0.38]" : "opacity-100"
                      }`}
                    >
                      <div className="flex min-w-0 w-full flex-col">
                        <textarea
                          ref={answerRef}
                          id="oral-answer"
                          rows={4}
                          readOnly={evaluating}
                          placeholder="Begin here — Enter when ready, Shift+Enter for a new line."
                          aria-invalid={Boolean(answerError)}
                          aria-describedby={answerError ? "oral-answer-error" : undefined}
                          onChange={() => {
                            if (answerError) setAnswerError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              if (!evaluating) runEvaluation();
                            }
                          }}
                          className="oral-answer-line box-border min-h-[4rem] max-h-[min(22vh,9rem)] w-full resize-none border-0 border-b-2 border-white/40 bg-white/[0.04] pb-2.5 pl-1 pr-1 pt-2 text-[0.9rem] leading-[1.62] text-white focus:outline-none focus-visible:outline-none focus:ring-0 sm:text-[0.95rem]"
                        />
                        {/* Writing-line glow under the border */}
                        <div className="pointer-events-none h-px w-full bg-gradient-to-r from-[#c9b48a]/18 via-[#d9ccb7]/22 to-transparent" aria-hidden />
                      </div>
                    </div>
                    {answerError && (
                      <p
                        id="oral-answer-error"
                        className="mt-2.5 text-[0.74rem] font-light italic text-rose-300/90"
                        role="alert"
                      >
                        {answerError}
                      </p>
                    )}
                    <div
                      className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${
                        answerError ? "mt-3" : "mt-2.5"
                      } ${evaluating ? "justify-end" : "justify-start"}`}
                    >
                      {!evaluating ? (
                        <button
                          type="button"
                          onClick={runShowMe}
                          className={`-ml-0.5 ${FOOTER_WHISPER}`}
                        >
                          If you want to hear one.
                        </button>
                      ) : null}
                      {evaluating ? (
                        <div className="flex items-center gap-2.5">
                          <span className="sr-only" role="status" aria-live="polite">
                            Examiner is considering your response.
                          </span>
                          {showThinkingCue ? (
                            <>
                              <motion.div
                                aria-hidden
                                className="h-px w-10 origin-right bg-gradient-to-l from-[#d3c4ad]/22 to-transparent"
                                animate={reduceMotion ? undefined : { opacity: [0.26, 0.58, 0.26], scaleX: [0.8, 1, 0.8] }}
                                transition={{
                                  duration: transitionMs(reduceMotion, 1.2),
                                  ease: "easeInOut",
                                  repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                                }}
                              />
                              <motion.span
                                aria-hidden
                                className="font-serif text-[1.05rem] italic leading-none text-[#f0e6d7]/88"
                                animate={reduceMotion ? undefined : { opacity: [0.35, 0.9, 0.35], y: [0, -1.5, 0] }}
                                transition={{
                                  duration: transitionMs(reduceMotion, 1.0),
                                  ease: "easeInOut",
                                  repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                                }}
                              >
                                …
                              </motion.span>
                              <motion.p
                                aria-hidden
                                className="max-w-[16rem] font-serif text-[0.8rem] font-light italic leading-snug tracking-[0.01em] text-white/72 sm:text-[0.82rem]"
                                animate={reduceMotion ? undefined : { opacity: [0.55, 0.88, 0.55] }}
                                transition={{
                                  duration: transitionMs(reduceMotion, 1.35),
                                  ease: "easeInOut",
                                  repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                                }}
                              >
                                Hang on.
                              </motion.p>
                            </>
                          ) : (
                            <p
                              aria-hidden
                              className="font-serif text-[0.8rem] font-light italic text-white/45 sm:text-[0.82rem]"
                            >
                              …
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="feedback-area"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{
                      duration: transitionMs(reduceMotion, 0.42),
                      ease: cinematicEase,
                    }}
                  >
                    <span className="sr-only">{item.contextLabel}</span>

                    <JudgmentBlock
                      id={dialogLabelId}
                      value={evaluation.score}
                      judgment={evaluation.judgment}
                      examinerNote={evaluation.examinerNote}
                      align="immersive"
                      settled={revealedSegments > 0}
                      teaching={showMeMode}
                    />

                    <div className="flex flex-col" aria-live="polite">
                      {explanationSegments.map((segment, index) => {
                        if (!segment || index >= revealedSegments) return null;
                        const isFirst = index === 0;
                        const duration = segmentDurations[index] ?? 0.88;
                        return (
                          <motion.p
                            key={`${item.id}-seg-${index}`}
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={
                              reduceMotion
                                ? { opacity: 1, y: 0 }
                                : {
                                    opacity: [0, 0.16, 0.42, 1],
                                    y: [7, 5, 3, 0],
                                  }
                            }
                            transition={{
                              duration: transitionMs(reduceMotion, duration),
                              times: reduceMotion
                                ? undefined
                                : [0, 0.14, 0.28, 1],
                              ease: cinematicEase,
                            }}
                            className={`text-[0.92rem] leading-[1.9] tracking-[0.01em] text-white/90 sm:text-[0.96rem] ${
                              isFirst ? "mt-8" : "mt-6"
                            }`}
                          >
                            {segment}
                          </motion.p>
                        );
                      })}
                    </div>

                    {/* Sample answer reveal — shown after "Show Me Answer" is clicked post-evaluation. */}
                    <AnimatePresence initial={false}>
                      {allSegmentsRevealed && showAnswer && !showMeMode && (
                        <motion.div
                          key="answer-reveal"
                          className="flex flex-col"
                          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                          transition={{
                            duration: transitionMs(reduceMotion, 0.55),
                            ease: cinematicEase,
                          }}
                        >
                          {/* Spoken examiner preamble before the model answer lines */}
                          <motion.p
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{
                              duration: transitionMs(reduceMotion, 0.4),
                              delay: reduceMotion ? 0 : 0.1,
                              ease: cinematicEase,
                            }}
                            className="mt-6 font-serif text-[0.82rem] font-light italic leading-[1.45] tracking-[0.01em] text-white/65 sm:text-[0.86rem]"
                          >
                            Here&rsquo;s what I&rsquo;m looking for.
                          </motion.p>
                          {sampleAnswerLines.map((line, index) => (
                            <motion.p
                              key={`${item.id}-sample-${index}`}
                              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.65),
                                delay: reduceMotion ? 0 : 0.18 + index * 0.38,
                                ease: cinematicEase,
                              }}
                              className={`text-[0.9rem] leading-[1.85] tracking-[0.01em] text-white/88 sm:text-[0.94rem] ${
                                index === 0 ? "mt-3" : "mt-3"
                              }`}
                            >
                              {line}
                            </motion.p>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {allSegmentsRevealed &&
                      !(showAnswer && answerRevealChromeHidden) && (
                      <FeedbackActions
                        score={evaluation.score}
                        teaching={showMeMode}
                        showAnswer={showAnswer}
                        onToggleAnswer={toggleAnswer}
                        onTryAgain={tryAgain}
                        onNextQuestion={advanceFromFeedback}
                        onReviewLater={reviewLater}
                        showCue={
                          showTransitionCue ||
                          (evaluation.score < 3 && !showMeMode)
                        }
                        reduceMotion={reduceMotion}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * Feedback action row — Phase 2.
 *
 * Score line + four explicit post-eval actions in-panel, directly under evaluator output:
 *   Try Again · Show Me Answer · Review Later   /   Next Question
 */

/** Secondary actions — clear, readable, not competing with examiner text. */
const SECONDARY_ACTION =
  "rounded-sm border-0 bg-transparent px-0.5 py-0.5 text-left font-serif text-[0.78rem] font-light not-italic tracking-[0.004em] text-white/58 outline-none transition-[color,background-color] duration-200 ease-out hover:bg-white/[0.06] hover:text-white/85 focus-visible:text-white/90 focus-visible:ring-1 focus-visible:ring-white/20 sm:text-[0.8rem]";

/** Primary — clearly distinguishable as the main forward action. */
const PRIMARY_ACTION =
  "inline-flex items-baseline gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 font-sans text-[0.78rem] font-normal not-italic tracking-[0.008em] text-white/88 shadow-none outline-none transition-[color,background-color,border-color] duration-200 ease-out hover:border-white/30 hover:bg-white/16 hover:text-white focus-visible:border-white/35 focus-visible:ring-1 focus-visible:ring-white/25 sm:text-[0.8rem]";

function FeedbackActions({
  score,
  teaching,
  showAnswer,
  onToggleAnswer,
  onTryAgain,
  onNextQuestion,
  onReviewLater,
  showCue,
  reduceMotion,
}: {
  score: ScoreValue;
  teaching: boolean;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  onTryAgain: () => void;
  onNextQuestion: () => void;
  onReviewLater: () => void;
  showCue: boolean;
  reduceMotion: boolean | null;
}) {
  const passed = teaching || score >= 3;
  const scoreMeaning = SCORE_MEANING[score];

  return (
    <motion.div
      className="mt-[calc(1.5rem*1.3)] flex flex-col gap-[calc(0.6rem*1.3)] sm:flex-row sm:items-center sm:justify-between sm:gap-[calc(1rem*1.3)]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: reduceMotion ? 1 : 0.88 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.55),
        delay: reduceMotion ? 0 : 0.28,
        ease: cinematicEase,
      }}
    >
      <div className="flex min-w-0 flex-col items-start gap-[calc(0.42rem*1.3)]">
        {!teaching ? (
          <p className="font-serif text-[0.75rem] font-light tracking-[0.01em] text-white/70 sm:text-[0.78rem]">
            <span className="font-medium not-italic text-white/92">
              Score {score}/3
            </span>
            {" — "}
            <span className="italic">{scoreMeaning}</span>
          </p>
        ) : null}

        {/* All 4 actions — whisper-weight, examiner room tone */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-[calc(0.5rem*1.3)] gap-y-[calc(0.375rem*1.3)]">
          <button
            type="button"
            onClick={onTryAgain}
            className={SECONDARY_ACTION}
          >
            Try Again
          </button>
          {/* Show Me Answer — one-way; disappears once the answer is visible */}
          {!teaching && !showAnswer ? (
            <>
              <span aria-hidden className="text-white/25">·</span>
              <button
                type="button"
                onClick={onToggleAnswer}
                className={SECONDARY_ACTION}
              >
                Show Me Answer
              </button>
            </>
          ) : null}
          <span aria-hidden className="text-white/25">·</span>
          {/* Review Later — marks and immediately moves on, no popup */}
          <button
            type="button"
            onClick={onReviewLater}
            className={SECONDARY_ACTION}
          >
            Review Later
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-[calc(0.75rem*1.3)] justify-start sm:justify-end">
        <AnimatePresence initial={false}>
          {showCue && !passed && !showAnswer ? (
            <motion.span
              key="cue"
              aria-hidden
              className="font-serif text-[0.76rem] font-light italic leading-none tracking-[0.01em] text-white/52 sm:text-[0.78rem]"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{
                duration: transitionMs(reduceMotion, 0.45),
                ease: cinematicEase,
              }}
            >
              Your move.
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button
          type="button"
          onClick={onNextQuestion}
          className={PRIMARY_ACTION}
        >
          <span>Next Question</span>
          <span
            aria-hidden
            className="rounded-[2px] border border-white/20 bg-black/25 px-1 py-[1px] text-[0.62rem] font-normal not-italic tracking-normal text-white/58"
          >
            Enter
          </span>
        </button>
      </div>
    </motion.div>
  );
}

function BackgroundStack({
  phase,
  justReceived,
}: {
  phase: SessionPhase;
  justReceived: boolean;
}) {
  const evaluating = phase === "evaluating";
  const feedback = phase === "feedback";
  const respond = phase === "respond";

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {/* Cockpit image — heavily dimmed: atmosphere only, never competes with content */}
      <Image
        src="/cockpit-bg.png"
        alt=""
        fill
        priority
        unoptimized
        className={`object-cover object-center transition-all duration-[1600ms] ease-out ${
          evaluating
            ? "scale-[1.045] brightness-[0.22] blur-sm saturate-[0.7]"
            : feedback
              ? "scale-[1.03] brightness-[0.28] blur-[2px] saturate-[0.8]"
              : respond
                ? "scale-[1.02] brightness-[0.32] blur-[2px]"
                : "brightness-[0.32] blur-[2px]"
        }`}
      />
      {/* Permanent heavy base overlay — ensures background never shows through */}
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      {/* Per-phase atmospheric gradient — subtle color depth, not darkness source */}
      <div
        className={`absolute inset-0 bg-gradient-to-b transition-all duration-[1200ms] ease-out ${
          evaluating
            ? "from-black/40 via-transparent to-black/55 opacity-100"
            : feedback
              ? "from-black/30 via-transparent to-black/45 opacity-100"
              : "from-black/25 via-transparent to-black/38 opacity-100"
        }`}
        aria-hidden
      />
      {evaluating && (
        <div
          className="absolute inset-0 bg-amber-950/[0.08] mix-blend-overlay transition-opacity duration-[1200ms] ease-out"
          aria-hidden
        />
      )}
      {/* Answer-received beat */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity ease-out ${
          justReceived
            ? "opacity-100 duration-[180ms]"
            : "opacity-0 duration-[520ms]"
        }`}
        aria-hidden
      />
      <div className="oral-grain absolute inset-0 opacity-[0.018]" aria-hidden />
    </div>
  );
}

function JudgmentBlock({
  id,
  value,
  judgment,
  examinerNote,
  align = "centered",
  settled = false,
  teaching = false,
}: {
  id: string;
  value: ScoreValue;
  judgment: string;
  examinerNote: string;
  align?: "centered" | "immersive";
  /**
   * Flips true the moment the examiner begins to speak (segment 1 appears).
   * Relaxes the verdict slightly so the handoff from "deciding" to "speaking"
   * has presence — the word settles back a touch rather than freezing.
   */
  settled?: boolean;
  /** Teaching mode — examiner is demonstrating, not grading. */
  teaching?: boolean;
}) {
  const immersive = align === "immersive";
  const reduceMotion = useReducedMotion();
  const followDelay = judgmentFollowDelayS(reduceMotion, value);

  if (immersive) {
    const headline = teaching ? verdictLine(value, true) : judgment;
    const verdictClass = teaching
      ? "text-white"
      : value <= 1
        ? "text-[#ffd8d0]"
        : value === 2
          ? "text-[#fff0d8]"
          : "text-white";

    const softShadow =
      value <= 1 && !teaching
        ? "0 2px 12px rgba(0,0,0,0.5)"
        : "0 2px 8px rgba(0,0,0,0.4)";

    const verdictEntryDurationS =
      teaching || value >= 3 ? 0.34 : value === 2 ? 0.4 : 0.48;

    return (
      <div className="mt-2.5 flex shrink-0 flex-col items-stretch text-left">
        <motion.h2
          id={id}
          className={`max-w-[min(100%,28rem)] font-serif text-[1.38rem] font-medium italic leading-[1.22] tracking-[0.012em] transition-all duration-[700ms] ease-out sm:text-[1.48rem] ${verdictClass} ${
            settled && !reduceMotion ? "translate-y-px opacity-[0.94]" : ""
          }`}
          initial={reduceMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: transitionMs(reduceMotion, verdictEntryDurationS),
            ease: [0.2, 0.72, 0.24, 1] as const,
          }}
          style={{ textShadow: softShadow }}
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0">{headline}</span>
          </span>
        </motion.h2>

        {!teaching && examinerNote ? (
          <motion.p
            className="mt-2.5 max-w-[min(100%,28rem)] text-[0.82rem] font-light leading-[1.78] text-white/80 sm:text-[0.86rem]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: followDelay * 0.35,
              duration: transitionMs(reduceMotion, 0.55),
              ease: cinematicEase,
            }}
          >
            {examinerNote}
          </motion.p>
        ) : null}

        <motion.div
          className="flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: followDelay,
            duration: transitionMs(reduceMotion, 0.55),
            ease: cinematicEase,
          }}
        >
          <div
            className="mt-4 h-px w-full max-w-[min(100%,14rem)] bg-gradient-to-r from-white/18 via-white/08 to-transparent"
            aria-hidden
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center text-center">
      <p className="text-[0.58rem] font-normal uppercase tracking-[0.32em] text-white/[0.22]">
        Examiner record
      </p>

      <h2
        id={id}
        className="mt-2.5 max-w-[99%] font-serif text-[1.5rem] font-semibold leading-[1.1] tracking-[0.01em] text-[#eee6dc] sm:text-[1.7rem]"
      >
        {judgment}
      </h2>

      <div
        className="mx-auto mt-3 h-px w-[min(100%,13rem)] bg-gradient-to-r from-transparent via-[#a08050]/35 to-transparent"
        aria-hidden
      />

      <div className="mt-4 w-full max-w-xl px-3 py-2.5 sm:px-4">
        <p className="text-[0.875rem] font-light italic leading-[1.55] text-[#aea598]/95 sm:text-[0.9rem]">
          {examinerNote}
        </p>
      </div>
    </div>
  );
}

/**
 * Split model answers and standards into short spoken beats — one thought
 * per reveal, not a wall of text.
 */
function splitSpokenChunks(text: string): readonly string[] {
  const t = text.trim();
  if (!t) return [];

  const afterSemicolon = t.split(/\s*;\s+/).map((s) => s.trim()).filter(Boolean);
  const stage1 =
    afterSemicolon.length > 1
      ? afterSemicolon
      : [t];

  const stage2 = stage1.flatMap((block) =>
    block.split(/\s*[—–]\s+/).map((s) => s.trim()).filter(Boolean),
  );

  const out: string[] = [];
  for (const chunk of stage2) {
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...(sentences.length ? sentences : [chunk]));
  }
  return out;
}

/**
 * Frontend-only: break already-split lines a bit shorter for display / reveal
 * pacing. Does not change source copy — only how many motion lines we render.
 * Splits long clauses at ", " when both sides stay substantial.
 */
function refineToShorterLines(
  lines: readonly string[],
  maxLen = 44,
  minClause = 8,
): string[] {
  const result: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length <= maxLen) {
      result.push(line);
      continue;
    }
    const byComma = line.split(/,\s+/).map((s) => s.trim()).filter(Boolean);
    if (
      byComma.length >= 2 &&
      byComma.every((p) => p.length >= minClause)
    ) {
      result.push(...byComma);
      continue;
    }
    result.push(line);
  }
  return result;
}

function compactSpokenLines(parts: readonly string[]): string[] {
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Phase 1 — spoken beats after the headline judgment (JudgmentBlock = line 1 only):
 * pressure → 1–2 gap **lines** (rubric-driven, separate sentences) → retry. Teaching mode still streams the
 * standard answer from static `evaluation` copy.
 */
function composeExplanationSegments(
  evaluation: EvaluationBlock,
  teaching: boolean = false,
): readonly string[] {
  if (teaching) {
    return compactSpokenLines([
      "Here's what I'm listening for.",
      ...refineToShorterLines([
        ...splitSpokenChunks(evaluation.stronger),
        ...splitSpokenChunks(evaluation.why),
      ]),
    ]);
  }
  return compactSpokenLines(refineToShorterLines([...evaluation.missed]));
}

function evaluateAnswer(
  item: OralItem,
  answer: string,
  repeatMissDepth: number = 0,
): EvaluationBlock {
  const rubric = rubricByItem[item.id] ?? [];
  const normalized = normalize(answer);
  const matched = rubric.filter((point) =>
    point.keywords.some((keyword) => normalized.includes(normalize(keyword))),
  );
  const missed = rubric.filter((point) => !matched.includes(point));
  const coverage = rubric.length === 0 ? 0 : matched.length / rubric.length;

  const score: ScoreValue =
    matched.length === 0 ? 0 : coverage >= 0.75 ? 3 : coverage >= 0.45 ? 2 : 1;

  const turn = buildExaminerSpokenTurn(item.id, score, missed, {
    repeatMissDepth: repeatMissDepth,
  });
  const spoken = compactSpokenBeats(turn.spokenBeats);

  return {
    score,
    outcomeLabel: "Examiner assessment",
    judgment: turn.judgment,
    examinerNote: turn.examinerNote,
    correct: [],
    missed: spoken.length > 0 ? spoken : ["Say it again — I'm listening."],
    stronger: item.evaluation.stronger,
    why: item.evaluation.why,
    deeperExplanation: item.evaluation.deeperExplanation,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * End-of-session screen — shown after all questions are done.
 * Lists questions the user flagged for review. Feels like the examiner
 * wrapping up the table session, not a results dashboard.
 */
function SessionEndScreen({
  markedItems,
  onRetryItem,
  onStartOver,
}: {
  markedItems: ReadonlySet<string>;
  onRetryItem: (id: string) => void;
  onStartOver: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const marked = ORAL_ITEMS.filter((item) => markedItems.has(item.id));

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.8),
        ease: cinematicEase,
      }}
      className="oral-glass-panel mx-auto w-full max-w-[min(88vw,50rem)] px-6 py-6 sm:px-8 sm:py-8"
    >
      <h2 className="font-serif text-[1.38rem] font-medium italic leading-[1.22] tracking-[0.012em] text-white sm:text-[1.48rem]">
        That covers it.
      </h2>

      <div
        className="mt-4 h-px w-full max-w-[min(100%,14rem)] bg-gradient-to-r from-white/18 via-white/08 to-transparent"
        aria-hidden
      />

      {marked.length > 0 ? (
        <div className="mt-8 flex flex-col">
          <p className="text-[0.62rem] font-normal uppercase tracking-[0.26em] text-white/52">
            {marked.length === 1
              ? "1 question set aside"
              : `${marked.length} questions set aside`}
          </p>

          <div className="mt-5 flex flex-col gap-7">
            {marked.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5">
                <p className="text-[0.6rem] font-normal uppercase tracking-[0.26em] text-white/45">
                  {item.contextLabel}
                </p>
                <p className="max-w-[min(100%,30rem)] font-serif text-[0.84rem] font-light italic leading-[1.42] text-white/72 sm:text-[0.88rem]">
                  {`\u201c${item.promptLine}\u201d`}
                </p>
                <button
                  type="button"
                  onClick={() => onRetryItem(item.id)}
                  className={`mt-0.5 self-start ${FOOTER_WHISPER}`}
                >
                  Go again.
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-8 font-serif text-[0.9rem] font-light italic leading-[1.55] text-white/62 sm:text-[0.94rem]">
          Nothing set aside.
        </p>
      )}

      <div className="mt-12">
        <button
          type="button"
          onClick={onStartOver}
          className={FOOTER_WHISPER}
        >
          Start over.
        </button>
      </div>
    </motion.div>
  );
}
