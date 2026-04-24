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

/**
 * Fixed outer panel: stable footprint across question/evaluation.
 * Only inner content scrolls/changes.
 */
const ORAL_PANEL_SHELL =
  "oral-glass-panel flex h-[min(90dvh,33rem)] w-full flex-col overflow-hidden";
const ORAL_PANEL_SCROLL =
  "oral-scrollbar-modern relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 py-6 text-left sm:px-8 sm:py-8";

/** Inline whisper links — e.g. "If you want to hear one." */
const FOOTER_WHISPER =
  "rounded-sm border-0 bg-transparent p-0 text-left font-serif text-[0.78rem] font-light italic tracking-[0.006em] text-white/58 outline-none transition-[color] duration-200 ease-out hover:text-white/80 focus-visible:text-white/90 focus-visible:ring-1 focus-visible:ring-white/22";

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
              className="relative mx-auto flex min-h-0 w-full max-w-[min(92vw,52rem)] flex-col"
            >
            <div className={ORAL_PANEL_SHELL}>
            <div className={ORAL_PANEL_SCROLL}>
              {sessionPhase !== "feedback" ? (
                <motion.div
                  animate={{
                    opacity: evaluating ? 0.45 : 1,
                  }}
                  transition={{
                    duration: transitionMs(reduceMotion, 1.2),
                    ease: cinematicEase,
                  }}
                >
                  <p className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-white/52">
                    {item.contextLabel}
                  </p>
                  <h1 className="mt-3 font-serif text-[1.6rem] font-medium italic leading-[1.22] tracking-[0.01em] text-white sm:text-[1.82rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>
                  <p className="mt-3 text-[0.88rem] font-light leading-[1.68] text-white/72 sm:text-[0.92rem]">
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
                  className="mt-1 w-full"
                >
                  <p className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-white/48">
                    {item.contextLabel}
                  </p>
                  <p className="mt-2 font-serif text-[0.86rem] font-light italic leading-[1.45] text-white/62 sm:text-[0.9rem]">
                    {`"${item.promptLine}"`}
                  </p>
                  <div className="mt-4 h-px w-full bg-white/[0.09]" aria-hidden />
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
                    className="mt-11 flex h-full w-full flex-col"
                  >
                    {/* Section divider */}
                    <div className="mb-5 h-px w-full bg-white/[0.09]" aria-hidden />

                    {/* Input label */}
                    <label
                      htmlFor="oral-answer"
                      className="mb-2.5 block text-[0.65rem] font-medium uppercase tracking-[0.22em] text-white/52"
                    >
                      Your response
                    </label>

                    {/* Textarea — dims while examiner is thinking */}
                    <div
                      className={`oral-input-wrap w-full transition-opacity duration-500 ease-out ${
                        evaluating ? "opacity-40" : "opacity-100"
                      }`}
                    >
                      <textarea
                        ref={answerRef}
                        id="oral-answer"
                        rows={5}
                        readOnly={evaluating}
                        placeholder="Answer here — press Enter when ready, Shift+Enter for new line."
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
                        className="oral-answer-line box-border w-full min-h-[8rem] max-h-[min(28vh,13rem)] resize-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-[0.93rem] leading-[1.72] text-white transition-all duration-200 focus:outline-none sm:text-[0.97rem]"
                      />
                    </div>

                    {answerError && (
                      <p
                        id="oral-answer-error"
                        className="mt-2 text-[0.74rem] font-light italic text-rose-300/90"
                        role="alert"
                      >
                        {answerError}
                      </p>
                    )}

                    {/* Bottom row: hint / thinking cue  ↔  Submit button */}
                    <div className="mt-auto flex min-h-[2rem] items-center justify-between gap-4 pt-3.5">
                      {/* Left — hint text or evaluating cue */}
                      <div className="flex items-center gap-2.5">
                        <span className="sr-only" role="status" aria-live="polite">
                          {evaluating ? "Examiner is considering your response." : ""}
                        </span>
                        {evaluating ? (
                          showThinkingCue ? (
                            <>
                              <motion.span
                                aria-hidden
                                className="font-serif text-[1rem] italic leading-none text-white/75"
                                animate={reduceMotion ? undefined : { opacity: [0.4, 0.9, 0.4], y: [0, -1.5, 0] }}
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
                                className="font-serif text-[0.82rem] font-light italic text-white/65"
                                animate={reduceMotion ? undefined : { opacity: [0.55, 0.9, 0.55] }}
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
                            <p aria-hidden className="font-serif text-[0.82rem] italic text-white/42">…</p>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={runShowMe}
                            className={FOOTER_WHISPER}
                          >
                            If you want to hear one.
                          </button>
                        )}
                      </div>

                      {/* Right — Submit button (hidden while evaluating) */}
                      {!evaluating && (
                        <button
                          type="button"
                          onClick={runEvaluation}
                          className={PRIMARY_ACTION}
                        >
                          Submit
                        </button>
                      )}
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
                            className={`text-[0.93rem] leading-[1.88] tracking-[0.008em] text-white/92 sm:text-[0.97rem] ${
                              isFirst ? "mt-8" : "mt-5"
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

/** Secondary actions — clearly readable, not competing with examiner copy. */
const SECONDARY_ACTION =
  "rounded-md border border-white/15 bg-white/[0.07] px-3 py-1.5 text-left font-sans text-[0.78rem] font-normal not-italic tracking-[0.004em] text-white/82 outline-none transition-all duration-200 ease-out hover:border-white/28 hover:bg-white/[0.12] hover:text-white focus-visible:ring-1 focus-visible:ring-white/30 sm:text-[0.8rem]";

/** Primary — solid, clearly the main forward action. */
const PRIMARY_ACTION =
  "inline-flex items-center gap-2 rounded-lg border border-white/28 bg-white/[0.14] px-4 py-2 font-sans text-[0.82rem] font-medium not-italic tracking-[0.008em] text-white outline-none transition-all duration-200 ease-out hover:border-white/40 hover:bg-white/[0.20] focus-visible:ring-2 focus-visible:ring-white/30 sm:text-[0.85rem]";

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
      className="mt-8 flex flex-col gap-4"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.55),
        delay: reduceMotion ? 0 : 0.28,
        ease: cinematicEase,
      }}
    >
      {/* Divider above actions */}
      <div className="h-px w-full bg-white/[0.09]" aria-hidden />

      {/* Score line */}
        {!teaching ? (
          <p className="text-[0.82rem] tracking-[0.008em] text-white/80 sm:text-[0.85rem]">
            <span className="font-bold not-italic text-white">
              Score {score}/3
            </span>
            <span className="mx-1.5 text-white/35">—</span>
            <span className="font-light italic">{scoreMeaning}</span>
          </p>
        ) : null}

      {/* Action rows */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left — secondary actions */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <button type="button" onClick={onTryAgain} className={SECONDARY_ACTION}>
            Try Again
          </button>
          {!teaching && !showAnswer ? (
            <>
              <button type="button" onClick={onToggleAnswer} className={SECONDARY_ACTION}>
                Show Me Answer
              </button>
            </>
          ) : null}
          <button type="button" onClick={onReviewLater} className={SECONDARY_ACTION}>
            Review Later
          </button>
        </div>

        {/* Right — primary action + pressure cue */}
        <div className="flex shrink-0 items-center gap-3">
          <AnimatePresence initial={false}>
            {showCue && !passed && !showAnswer ? (
              <motion.span
                key="cue"
                aria-hidden
                className="font-serif text-[0.76rem] font-light italic text-white/48 sm:text-[0.78rem]"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: transitionMs(reduceMotion, 0.45), ease: cinematicEase }}
              >
                Your move.
              </motion.span>
            ) : null}
          </AnimatePresence>
          <button type="button" onClick={onNextQuestion} className={PRIMARY_ACTION}>
            <span>Next Question</span>
            <span
              aria-hidden
              className="rounded border border-white/22 bg-black/30 px-1.5 py-[2px] text-[0.62rem] font-normal tracking-normal text-white/60"
            >
              Enter
            </span>
          </button>
        </div>
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
      {/* Cockpit image — photo is visible; dims slightly per phase for focus */}
      <Image
        src="/cockpit-bg.png"
        alt=""
        fill
        priority
        unoptimized
        className={`object-cover object-center transition-all duration-[1600ms] ease-out ${
          evaluating
            ? "scale-[1.045] brightness-[0.55] saturate-[0.85]"
            : feedback
              ? "scale-[1.03] brightness-[0.65] saturate-[0.9]"
              : respond
                ? "scale-[1.02] brightness-[0.72]"
                : "brightness-[0.72]"
        }`}
      />
      {/* Edge vignette — darkens corners/edges so the card stands out naturally */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_70%_65%_at_50%_50%,transparent_40%,rgba(0,0,0,0.55)_100%)]"
        aria-hidden
      />
      {/* Very light overall tint — takes edge off the raw photo without killing it */}
      <div className="absolute inset-0 bg-black/18" aria-hidden />
      {evaluating && (
        <div
          className="absolute inset-0 bg-amber-950/[0.07] mix-blend-overlay transition-opacity duration-[1200ms] ease-out"
          aria-hidden
        />
      )}
      {/* Answer-received beat */}
      <div
        className={`absolute inset-0 bg-black/15 transition-opacity ease-out ${
          justReceived
            ? "opacity-100 duration-[180ms]"
            : "opacity-0 duration-[520ms]"
        }`}
        aria-hidden
      />
      <div className="oral-grain absolute inset-0 opacity-[0.022]" aria-hidden />
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
        ? "text-[#ffbcb0]"
        : value === 2
          ? "text-[#ffe4b0]"
          : "text-white";

    const softShadow =
      value <= 1 && !teaching
        ? "0 0 24px rgba(255,120,90,0.18), 0 2px 10px rgba(0,0,0,0.5)"
        : "0 2px 8px rgba(0,0,0,0.35)";

    const verdictEntryDurationS =
      teaching || value >= 3 ? 0.34 : value === 2 ? 0.4 : 0.48;

    return (
      <div className="mt-2.5 flex shrink-0 flex-col items-stretch text-left">
        <motion.h2
          id={id}
          className={`max-w-[min(100%,30rem)] font-serif text-[1.55rem] font-semibold italic leading-[1.2] tracking-[0.01em] transition-all duration-[700ms] ease-out sm:text-[1.72rem] ${verdictClass} ${
            settled && !reduceMotion ? "translate-y-px opacity-[0.95]" : ""
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
            className="mt-3 max-w-[min(100%,30rem)] text-[0.88rem] font-light leading-[1.72] text-white/88 sm:text-[0.92rem]"
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
