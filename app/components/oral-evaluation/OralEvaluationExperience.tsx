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

/**
 * Deterministic pseudo-random in [0, 1) — stable per seed.
 * Used where a small amount of natural jitter has to be computed during
 * render but must remain pure across re-renders (React lint guarantees).
 */
function jitterFromSeed(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const rubricByItem: Record<string, readonly RubricPoint[]> = {
  "preflight-prep": [
    { label: "weather interpretation", keywords: ["weather", "taf", "metar"] },
    { label: "NOTAM and airspace review", keywords: ["notam", "tfr", "airspace"] },
    { label: "performance and runway suitability", keywords: ["performance", "runway", "density altitude", "takeoff"] },
    { label: "weight and balance", keywords: ["weight", "balance", "cg", "center of gravity"] },
    { label: "fuel reserves and alternates", keywords: ["fuel", "reserve", "alternate", "divert"] },
  ],
  "lost-comms-vfr": [
    { label: "transponder action", keywords: ["7600", "transponder", "squawk"] },
    { label: "route priority", keywords: ["assigned", "expected", "filed", "route"] },
    { label: "altitude priority", keywords: ["mea", "minimum", "altitude", "highest"] },
    { label: "regulatory basis", keywords: ["91.185", "regulation", "rule"] },
    { label: "practical execution order", keywords: ["first", "then", "order", "sequence"] },
  ],
  "stall-spin": [
    { label: "stall cue recognition", keywords: ["buffet", "horn", "control feel", "mushy"] },
    { label: "angle-of-attack explanation", keywords: ["angle of attack", "aoa", "critical angle"] },
    { label: "recovery priority", keywords: ["reduce", "unload", "power", "recover"] },
    { label: "coordination discipline", keywords: ["coordinated", "rudder", "ball", "yaw"] },
    { label: "return to assignment", keywords: ["altitude", "configuration", "wings level", "climb"] },
  ],
  "night-currency": [
    { label: "correct regulation", keywords: ["61.57", "regulation", "rule"] },
    { label: "full-stop requirement", keywords: ["full stop", "landing", "takeoff"] },
    { label: "night definition", keywords: ["civil twilight", "night", "sunset"] },
    { label: "90-day window", keywords: ["90 day", "90-day", "within 90"] },
    { label: "legal determination with dates/times", keywords: ["logbook", "date", "time", "legal"] },
  ],
  "crosswind-gusts": [
    { label: "stabilized approach criteria", keywords: ["stabilized", "approach", "criteria"] },
    { label: "gust strategy", keywords: ["gust", "spread", "add airspeed", "correction"] },
    { label: "crosswind control inputs", keywords: ["aileron", "rudder", "slip", "crab"] },
    { label: "touchdown technique", keywords: ["upwind wheel", "flare", "touchdown"] },
    { label: "personal limits and go-around gates", keywords: ["personal minimum", "limit", "go around", "abort"] },
  ],
};

function transitionMs(reduce: boolean | null, ms: number) {
  return reduce ? 0 : ms;
}

/** Short disposition line — shown alone before any supporting copy. */
function verdictLine(score: ScoreValue, teaching: boolean = false): string {
  if (teaching) return "Here’s what I want.";
  if (score >= 3) return "Satisfactory.";
  return "Not sufficient.";
}

/**
 * Verdict hold before anything else renders.
 *
 * Natural examiner delivery: short, decisive, then a beat of silence.
 * Range: 800–1200ms, with light variation so it never feels timed.
 */
function explanationRevealDelayMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 900;
  const jitter = Math.floor(Math.random() * 200);
  if (score <= 1) return 1100 + jitter;
  if (score === 2) return 950 + jitter;
  return 850 + jitter;
}

/**
 * Subtle divider / ambient reveal delay under the verdict.
 * Held until the end of the verdict-solo window so nothing
 * competes with the verdict while it lands.
 */
function judgmentFollowDelayS(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 1.0;
  if (score <= 1) return 1.25;
  if (score === 2) return 1.1;
  return 1.0;
}

/**
 * Inter-segment pause between spoken explanation parts.
 *
 * Models a human examiner finishing one thought, taking a beat,
 * and landing the next. Length-sensitive (gives reading room) with
 * natural jitter so the rhythm never feels mechanical.
 */
function segmentRevealDelayMs(segmentText: string, reduce: boolean | null): number {
  if (reduce) return 450;
  const base = 1500;
  const readRoom = Math.min(1400, Math.floor(segmentText.length * 11));
  const jitter = Math.floor(Math.random() * 420);
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
 * Examiner processing beat.
 *
 * The pause should feel like a person considering what was just said —
 * never perfectly fixed, and slightly influenced by how much there is to weigh.
 * Range: 1200–1800ms.
 */
function examinerThinkingPauseMs(answer: string): number {
  const base = 1200;
  const weightFromLength = Math.min(350, Math.floor(answer.length * 2.2));
  const humanJitter = Math.floor(Math.random() * 260);
  return Math.min(1800, base + weightFromLength + humanJitter);
}

/** Blended surface — reads as depth in the cockpit, not a floating card. */
const ATMOSPHERE_PANEL =
  "px-1 py-2 sm:px-2 sm:py-3";

/** Footer links — examiner-room whispers, not dashboard CTAs. */
const FOOTER_WHISPER =
  "rounded-sm border-0 bg-transparent p-0 text-left font-serif text-[0.72rem] font-light italic tracking-[0.006em] text-white/[0.26] outline-none transition-[color] duration-200 ease-out hover:text-[#b8aa9a]/52 focus-visible:text-[#c9beb0]/62 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/18";

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
  
  const [showMeMode, setShowMeMode] = useState(false);
  // Gated reveal of the full strong answer (model answer + rationale + deeper).
  // Never open by default — the user has to ask for it.
  const [showAnswer, setShowAnswer] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();
  const evaluationTimerRef = useRef<number | null>(null);

  const item = ORAL_ITEMS[itemIndex]!;
  const evaluation = evaluated ?? item.evaluation;
  const explanationSegments = useMemo(
    () => composeExplanationSegments(evaluation, showMeMode),
    [evaluation, showMeMode],
  );
  const isMarked = markedItems.has(item.id);
  // Per-segment reveal durations — memoized so each evaluation has its own
  // stable-yet-uneven cadence. Longer thoughts articulate a touch slower,
  // with random jitter so the rhythm never lines up twice.
  const segmentDurations = useMemo(
    () =>
      explanationSegments.map((segment, index) => {
        const base = 0.78;
        const lengthPacing = Math.min(0.26, segment.length * 0.0018);
        const jitter = jitterFromSeed(segment.length + index * 31) * 0.22;
        return base + lengthPacing + jitter;
      }),
    [explanationSegments],
  );
  const segmentCount = explanationSegments.filter((s) => s.trim().length > 0)
    .length;
  const allSegmentsRevealed =
    segmentCount === 0 ? true : revealedSegments >= segmentCount;

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
    setEvaluated(evaluateAnswer(item, answer));
    setShowMeMode(false);
    setShowAnswer(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setSessionPhase("evaluating");
    const pauseMs = examinerThinkingPauseMs(answer);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [item]);

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
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setSessionPhase("evaluating");
    const pauseMs = 700 + Math.floor(Math.random() * 360);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, []);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    if (answerRef.current) answerRef.current.value = "";
    setItemIndex((i) => (i + 1) % ORAL_ITEMS.length);
  }, []);

  // The pushback. Same question, cleared textarea, focus restored.
  // The examiner isn't giving up the answer — they're making the user talk again.
  const tryAgain = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    if (answerRef.current) answerRef.current.value = "";
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

  const toggleAnswer = useCallback(() => {
    setShowAnswer((prev) => !prev);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

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

  // The primary action is context-sensitive:
  //   - Teaching mode (showMeMode) or a passing score  → Enter moves on.
  //   - Anything below satisfactory                    → Enter retries. This
  //     is the whole point of the DPE posture: you don't walk away; you talk
  //     again. The examiner keeps the pressure on the user, not on the clock.
  const primaryAfterFeedback = useCallback(() => {
    if (showMeMode || evaluation.score >= 3) {
      advanceFromFeedback();
    } else {
      tryAgain();
    }
  }, [advanceFromFeedback, evaluation.score, showMeMode, tryAgain]);

  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        primaryAfterFeedback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allSegmentsRevealed, primaryAfterFeedback, sessionPhase]);

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
    let cumulative = explanationRevealDelayMs(reduceMotion, evaluation.score);
    for (let i = 0; i < segments.length; i++) {
      const index = i;
      timers.push(
        window.setTimeout(() => {
          setRevealedSegments(index + 1);
        }, cumulative),
      );
      if (i < segments.length - 1) {
        cumulative += segmentRevealDelayMs(segments[i]!, reduceMotion);
      }
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [evaluation.score, explanationSegments, reduceMotion, sessionPhase]);

  // End-of-moment pacing.
  //
  // DPE rule: on an incomplete or unsatisfactory answer, the room does NOT
  // move on by itself. The user has to act — try again, ask for the answer,
  // or explicitly move on. No auto-advance, no clock rescuing them.
  //
  // A satisfactory answer is the only case where a soft wrap-up cue lands
  // and the session will drift forward. Everywhere else, the silence after
  // the verdict is the pressure.
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
    const advanceTimer = window.setTimeout(() => {
      advanceFromFeedback();
    }, dwell);
    return () => {
      window.clearTimeout(cueTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [
    advanceFromFeedback,
    allSegmentsRevealed,
    evaluation.score,
    reduceMotion,
    sessionPhase,
    showAnswer,
    showMeMode,
  ]);

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
            {sessionPhase !== "feedback" ? (
              <BookmarkToggle marked={isMarked} onToggle={toggleMark} />
            ) : null}

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
                  <h1 className="mt-1 font-serif text-[1.45rem] font-medium italic leading-[1.22] tracking-[0.01em] text-[#f7f2ea] sm:text-[1.65rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>

                  <p className="mt-4 max-w-[min(100%,30rem)] text-[0.8rem] font-light leading-[1.62] text-white/[0.44] sm:text-[0.84rem]">
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
                  <p className="text-[0.58rem] font-normal uppercase tracking-[0.26em] text-white/[0.22]">
                    {item.contextLabel}
                  </p>
                  <p className="mt-1.5 font-serif text-[0.8rem] font-light italic leading-[1.45] text-white/[0.34] sm:text-[0.84rem]">
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
                    {/* Left-bar + writing-area — dims while examiner is thinking */}
                    <div
                      className={`oral-input-wrap relative mt-3 flex gap-3 transition-opacity duration-500 ease-out ${
                        evaluating ? "opacity-[0.38]" : "opacity-100"
                      }`}
                    >
                      {/* Left accent bar */}
                      <div
                        aria-hidden
                        className="pointer-events-none mt-1 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#d8c7ad]/55 via-[#c9b48a]/35 to-transparent"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
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
                          className="oral-answer-line box-border min-h-[4rem] max-h-[min(22vh,9rem)] w-full resize-none border-0 border-b-2 border-[#c9b48a]/55 bg-[#050810]/50 pb-2.5 pl-1 pr-1 pt-2 text-[0.9rem] leading-[1.62] text-[#ebe6dc] focus:outline-none focus-visible:outline-none focus:ring-0 sm:text-[0.95rem]"
                        />
                        {/* Writing-line glow under the border */}
                        <div className="pointer-events-none h-px w-full bg-gradient-to-r from-[#c9b48a]/18 via-[#d9ccb7]/22 to-transparent" aria-hidden />
                      </div>
                    </div>
                    {answerError && (
                      <p
                        id="oral-answer-error"
                        className="mt-2.5 text-[0.74rem] font-light italic text-rose-200/65"
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
                                className="max-w-[16rem] font-serif text-[0.8rem] font-light italic leading-snug tracking-[0.01em] text-[#b5aa9d]/72 sm:text-[0.82rem]"
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
                              className="font-serif text-[0.8rem] font-light italic text-[#a0988c]/58 sm:text-[0.82rem]"
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
                                    // Hesitation beat at the start of each
                                    // segment — the examiner catches a breath,
                                    // forms the thought, then the words land.
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
                            className={`text-[0.9rem] leading-[1.95] tracking-[0.01em] text-[#c4beb4]/96 sm:text-[0.95rem] ${
                              isFirst ? "mt-8" : "mt-7"
                            }`}
                          >
                            {segment}
                          </motion.p>
                        );
                      })}
                    </div>

                    {allSegmentsRevealed && (
                      <FeedbackActions
                        score={evaluation.score}
                        teaching={showMeMode}
                        showAnswer={showAnswer}
                        onToggleAnswer={toggleAnswer}
                        onTryAgain={tryAgain}
                        onMoveOn={advanceFromFeedback}
                        marked={isMarked}
                        onToggleMark={toggleMark}
                        showCue={
                          showTransitionCue ||
                          (evaluation.score < 3 && !showMeMode)
                        }
                        reduceMotion={reduceMotion}
                      />
                    )}

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
                          {[
                            ...splitSpokenChunks(item.evaluation.stronger),
                            ...splitSpokenChunks(item.evaluation.why),
                            ...item.evaluation.deeperExplanation,
                          ].map((line, index) => (
                            <motion.p
                              key={`${item.id}-answer-${index}`}
                              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.7),
                                delay: reduceMotion
                                  ? 0
                                  : 0.24 +
                                    index *
                                      (0.38 +
                                        jitterFromSeed(line.length + index * 17) *
                                          0.18),
                                ease: cinematicEase,
                              }}
                              className={`text-[0.88rem] leading-[1.92] tracking-[0.01em] text-[#b9b3a9]/92 sm:text-[0.92rem] ${
                                index === 0 ? "mt-5" : "mt-6"
                              }`}
                            >
                              {line}
                            </motion.p>
                          ))}
                          <button
                            type="button"
                            onClick={toggleAnswer}
                            className="mt-8 inline-flex self-start items-center rounded-sm border border-[#d8c7ad]/20 bg-[#050810]/55 px-2.5 py-1.5 font-serif text-[0.82rem] font-normal not-italic tracking-[0.008em] text-[#d7cec2]/85 outline-none backdrop-blur-sm transition-[color,background-color,border-color] duration-200 ease-out hover:border-[#d8c7ad]/40 hover:bg-[#0b111a]/70 hover:text-[#f2ebde]/96 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/40 sm:text-[0.85rem]"
                          >
                            Hide the answer
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
 * Bookmark toggle — minimal, non-distracting.
 *
 * A small flag icon tucked into the corner of the panel. It's present
 * but recessed; marking a question feels like flipping a silent flag,
 * not triggering a UI element.
 */
function BookmarkToggle({
  marked,
  onToggle,
}: {
  marked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={marked ? "Unmark this question" : "Mark this question for review"}
      aria-pressed={marked}
      className={`absolute right-2 top-1 z-10 h-6 w-6 rounded-full outline-none transition-colors duration-300 ease-out focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/28 sm:right-3 sm:top-2 ${
        marked
          ? "text-[#c9a66e]/55 hover:text-[#d4b17a]/72"
          : "text-white/[0.22] hover:text-white/[0.38]"
      }`}
    >
      <svg
        viewBox="0 0 14 18"
        width="14"
        height="18"
        aria-hidden
        className="mx-auto"
      >
        <path
          d="M2.5 2h9a0.5 0.5 0 0 1 0.5 0.5v14l-5-3-5 3v-14a0.5 0.5 0 0 1 0.5-0.5z"
          fill={marked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Feedback action row.
 *
 * Shape follows the DPE posture, not a ChatGPT-style "here's everything" card:
 *
 *   - Failed / incomplete (score < 3):
 *       Primary (right, Enter)         → "Try again" (same question)
 *       Secondary (left, toggle)       → "Show me the answer" / "Hide the answer"
 *       Tertiary (left, quiet)         → "Move on" (escape hatch, not nudged)
 *       Soft italic cue (left)         → "Your move." — lands with showCue
 *
 *   - Satisfactory (score ≥ 3) or teaching mode:
 *       Primary (right, Enter)         → "Next question"
 *       Secondary (left, toggle)       → "Show me the answer" (still available)
 *
 * The user has to act. The room no longer drifts forward by itself on a miss.
 */
/** Secondary action — quiet but legible against the cockpit. */
const SECONDARY_ACTION =
  "rounded-sm border-0 bg-transparent px-1 py-0.5 text-left font-serif text-[0.82rem] font-normal not-italic tracking-[0.008em] text-[#d7cec2]/82 outline-none transition-[color,background-color] duration-200 ease-out hover:bg-[#d8c7ad]/10 hover:text-[#f2ebde]/96 focus-visible:text-[#f2ebde]/96 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/40 sm:text-[0.85rem]";

/** Primary action — pill. Reads as "this is what you do next." */
const PRIMARY_ACTION =
  "inline-flex items-baseline gap-2 rounded-full border border-[#d8c7ad]/38 bg-[#1a2230]/60 px-3.5 py-1.5 font-sans text-[0.82rem] font-medium not-italic tracking-[0.01em] text-[#f5eedf] shadow-[0_2px_10px_rgba(0,0,0,0.25)] outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-out hover:border-[#d8c7ad]/60 hover:bg-[#223046]/75 hover:text-white hover:shadow-[0_3px_14px_rgba(0,0,0,0.4)] focus-visible:border-[#d8c7ad]/70 focus-visible:ring-2 focus-visible:ring-[#d8c7ad]/40 sm:text-[0.85rem]";

function FeedbackActions({
  score,
  teaching,
  showAnswer,
  onToggleAnswer,
  onTryAgain,
  onMoveOn,
  marked,
  onToggleMark,
  showCue,
  reduceMotion,
}: {
  score: ScoreValue;
  teaching: boolean;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  onTryAgain: () => void;
  onMoveOn: () => void;
  marked: boolean;
  onToggleMark: () => void;
  showCue: boolean;
  reduceMotion: boolean | null;
}) {
  const passed = teaching || score >= 3;
  const primaryLabel = passed ? "Next question" : "Try again";
  const primaryAction = passed ? onMoveOn : onTryAgain;

  return (
    <motion.div
      className="mt-[calc(2rem*1.3)] flex flex-col gap-[calc(0.75rem*1.3)] sm:flex-row sm:items-center sm:justify-between sm:gap-[calc(1.25rem*1.3)]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.6),
        delay: reduceMotion ? 0 : 0.35,
        ease: cinematicEase,
      }}
    >
        <div className="flex min-w-0 flex-wrap items-center gap-x-[calc(0.5rem*1.3)] gap-y-[calc(0.375rem*1.3)]">
          {!teaching ? (
            <button
              type="button"
              onClick={onToggleAnswer}
              aria-expanded={showAnswer}
              className={SECONDARY_ACTION}
            >
              {showAnswer ? "Hide the answer" : "Show me the answer"}
            </button>
          ) : null}
          {!teaching ? (
            <span aria-hidden className="text-white/[0.18]">·</span>
          ) : null}
          <button
            type="button"
            onClick={onToggleMark}
            aria-pressed={marked}
            className={SECONDARY_ACTION}
          >
            {marked ? "Saved for review" : "Review later"}
          </button>
          {!passed ? (
            <>
              <span aria-hidden className="text-white/[0.18]">·</span>
              <button
                type="button"
                onClick={onMoveOn}
                className={SECONDARY_ACTION}
              >
                Move on
              </button>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-[calc(0.75rem*1.3)] justify-start sm:justify-end">
          <AnimatePresence initial={false}>
            {showCue && !passed && !showAnswer ? (
              <motion.span
                key="cue"
                aria-hidden
                className="font-serif text-[0.8rem] font-light italic leading-none tracking-[0.01em] text-[#d8c7ad]/78 sm:text-[0.82rem]"
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
            onClick={primaryAction}
            className={PRIMARY_ACTION}
          >
            <span>{primaryLabel}</span>
            <span
              aria-hidden
              className="rounded-[3px] border border-[#d8c7ad]/30 bg-black/25 px-1.5 py-[1px] text-[0.66rem] font-medium not-italic tracking-normal text-white/[0.72]"
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
      <Image
        src="/cockpit-bg.png"
        alt=""
        fill
        priority
        unoptimized
        className={`object-cover object-center transition-all duration-[1600ms] ease-out ${
          evaluating
            ? "scale-[1.045] brightness-[0.66] saturate-[0.9]"
            : feedback
              ? "scale-[1.03] brightness-[0.78]"
              : respond
                ? "scale-[1.02] brightness-[0.82]"
                : "brightness-[0.82]"
        }`}
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b from-[#0a1428]/32 via-[#050810]/10 transition-all duration-[1200ms] ease-out ${
          evaluating
            ? "to-[#040608]/52 opacity-100"
            : feedback
              ? "to-[#050810]/40 opacity-100"
              : respond
                ? "to-[#050810]/34 opacity-100"
                : "to-[#060a12]/28 opacity-100"
        }`}
        aria-hidden
      />
      <div
        className={`absolute inset-0 transition-opacity duration-[1400ms] ease-out ${
          evaluating
            ? "bg-[radial-gradient(ellipse_72%_58%_at_50%_40%,transparent_18%,rgba(3,5,10,0.46)_100%)] opacity-100"
            : "bg-[radial-gradient(ellipse_95%_75%_at_50%_38%,transparent_32%,rgba(5,8,16,0.24)_100%)] opacity-100"
        }`}
        aria-hidden
      />
      {respond && !evaluating && (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_78%_62%_at_38%_42%,transparent_0%,rgba(5,8,16,0.1)_100%)]"
          aria-hidden
        />
      )}
      {(evaluating || feedback) && (
        <div
          className={`absolute inset-0 transition-all duration-[1200ms] ease-out ${
            evaluating ? "bg-black/[0.14]" : "bg-black/[0.05]"
          }`}
          aria-hidden
        />
      )}
      {evaluating && (
        <div
          className="absolute inset-0 bg-amber-950/[0.06] mix-blend-overlay transition-opacity duration-[1200ms] ease-out"
          aria-hidden
        />
      )}
      {feedback && (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_72%_58%_at_50%_38%,transparent_0%,rgba(5,8,16,0.1)_100%)]"
          aria-hidden
        />
      )}
      {/* Answer-received beat — a brief environmental acknowledgement.
          Fades in quickly, lingers a moment, then eases out as the
          examiner begins to think. */}
      <div
        className={`absolute inset-0 bg-[radial-gradient(ellipse_68%_54%_at_50%_42%,transparent_20%,rgba(2,4,9,0.38)_100%)] transition-opacity ease-out ${
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
      ? "text-[#f0e8de]"
      : value <= 1
        ? "text-[#e8d8d2] sm:text-[#e4d2cb]"
        : value === 2
          ? "text-[#ebe4d6]"
          : "text-[#f0e8de]";

    const softShadow =
      value <= 1 && !teaching
        ? "0 6px 22px rgba(48,14,10,0.22)"
        : "0 5px 18px rgba(12,10,8,0.18)";

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
            duration: transitionMs(reduceMotion, 0.34),
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
            className="mt-2.5 max-w-[min(100%,28rem)] text-[0.8rem] font-light leading-[1.78] text-[#9c968c]/95 sm:text-[0.84rem]"
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
            className="mt-4 h-px w-full max-w-[min(100%,14rem)] bg-gradient-to-r from-[#a08050]/14 via-[#a08050]/06 to-transparent"
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

function compactSpokenLines(parts: readonly string[]): string[] {
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Spoken beats after the headline judgment (JudgmentBlock = line 1 only).
 *
 * Client structure (evaluator, not teacher):
 *   2. Pressure — challenge the answer
 *   3. Gaps — only 1–2 areas, conversational
 *   4. Retry push — explicit “walk me through it again…” (plus Try again in UI)
 *
 * No model answer, no rationale, no praise here. Those stay behind
 * “Show me the answer”. Teaching mode is the lone demonstration path.
 */
function composeExplanationSegments(
  evaluation: EvaluationBlock,
  teaching: boolean = false,
): readonly string[] {
  if (teaching) {
    return compactSpokenLines([
      "All right — here’s what I’m listening for on this one.",
      ...splitSpokenChunks(evaluation.stronger),
      ...splitSpokenChunks(evaluation.why),
    ]);
  }
  return compactSpokenLines([...evaluation.missed]);
}

function evaluateAnswer(item: OralItem, answer: string): EvaluationBlock {
  const rubric = rubricByItem[item.id] ?? [];
  const normalized = normalize(answer);
  const matched = rubric.filter((point) =>
    point.keywords.some((keyword) => normalized.includes(normalize(keyword))),
  );
  const missed = rubric.filter((point) => !matched.includes(point));
  const coverage = rubric.length === 0 ? 0 : matched.length / rubric.length;

  const score: ScoreValue =
    coverage >= 0.75 ? 3 : coverage >= 0.45 ? 2 : 1;

  const turn = buildExaminerSpokenTurn(item.id, score, missed);
  const spoken = compactSpokenBeats(turn.spokenBeats);

  return {
    score,
    outcomeLabel: "Examiner assessment",
    judgment: turn.judgment,
    examinerNote: turn.examinerNote,
    correct: [],
    missed: spoken.length > 0 ? spoken : ["Say it again — I’m listening."],
    stronger: item.evaluation.stronger,
    why: item.evaluation.why,
    deeperExplanation: item.evaluation.deeperExplanation,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
