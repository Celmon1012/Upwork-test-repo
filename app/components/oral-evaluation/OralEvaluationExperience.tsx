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
  EVALUATING_MS,
  ORAL_ITEMS,
  type EvaluationBlock,
  type OralItem,
  type ScoreValue,
} from "./content";

type SessionPhase = "respond" | "evaluating" | "feedback";
type RubricPoint = { label: string; keywords: readonly string[] };

const easeOut = [0.22, 1, 0.36, 1] as const;
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
 * Anchored to "all segments revealed," so the user gets a consistent
 * reading window regardless of how long the segmented delivery took.
 * Lower scores get a longer dwell — more to sit with.
 * Light jitter keeps the end-of-moment from feeling timed.
 */
function readingDwellAfterSpeechMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 38000;
  const jitter = Math.floor(Math.random() * 2200);
  if (score <= 1) return 44000 + jitter;
  if (score === 2) return 40000 + jitter;
  return 36000 + jitter;
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
  const [showDeeper, setShowDeeper] = useState(false);
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
  const allSegmentsRevealed = revealedSegments >= 3;

  const runEvaluation = useCallback(() => {
    const answer = answerRef.current?.value.trim() ?? "";
    if (!answer) {
      setAnswerError("Give me something to work with before I can grade you.");
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
    setShowDeeper(false);
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
    setShowDeeper(false);
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
    setShowDeeper(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    if (answerRef.current) answerRef.current.value = "";
    setItemIndex((i) => (i + 1) % ORAL_ITEMS.length);
  }, []);

  const toggleMark = useCallback(() => {
    setMarkedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, [item.id]);

  const toggleDeeper = useCallback(() => {
    setShowDeeper((prev) => !prev);
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

  // Enter advances manually once the examiner has finished speaking,
  // so users don't have to wait out the auto-advance dwell.
  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        advanceFromFeedback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advanceFromFeedback, allSegmentsRevealed, sessionPhase]);

  useEffect(() => {
    return () => {
      if (evaluationTimerRef.current) {
        window.clearTimeout(evaluationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sessionPhase !== "feedback") return;
    const timers: number[] = [];
    const firstDelay = explanationRevealDelayMs(reduceMotion, evaluation.score);
    timers.push(
      window.setTimeout(() => {
        setRevealedSegments(1);
        const secondDelay = segmentRevealDelayMs(
          explanationSegments[0],
          reduceMotion,
        );
        timers.push(
          window.setTimeout(() => {
            setRevealedSegments(2);
            const thirdDelay = segmentRevealDelayMs(
              explanationSegments[1],
              reduceMotion,
            );
            timers.push(
              window.setTimeout(() => {
                setRevealedSegments(3);
              }, thirdDelay),
            );
          }, secondDelay),
        );
      }, firstDelay),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [evaluation.score, explanationSegments, reduceMotion, sessionPhase]);

  // End-of-moment pacing.
  //
  //   1. Examiner finishes speaking (all segments revealed).
  //   2. A long reading dwell — user sits with the feedback.
  //   3. Near the end of that dwell, the examiner's wrap-up cue lands.
  //   4. A beat later, the room moves on.
  //
  // The cue and the advance are paired so that "Let's move on." actually
  // precedes moving on, rather than floating there for 40 seconds.
  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    // If the user asked for more, the examiner stays with them — no auto
    // advance, no wrap-up cue. The user drives when to continue.
    if (showDeeper) return;
    const dwell = readingDwellAfterSpeechMs(reduceMotion, evaluation.score);
    const cueLead = reduceMotion
      ? 2200
      : 4500 + Math.floor(Math.random() * 900);
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
    showDeeper,
  ]);

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#0a1018]">
      <BackgroundStack phase={sessionPhase} justReceived={justReceived} />

      <div
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        style={{ zoom: 1.2 }}
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              role="region"
              aria-label={`${item.contextLabel} — examiner`}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{
                duration: transitionMs(reduceMotion, 0.9),
                ease: cinematicEase,
              }}
              className="relative mx-auto w-full max-w-[min(100%,35rem)]"
            >
            <BookmarkToggle marked={isMarked} onToggle={toggleMark} />

            <div
              className={`oral-scrollbar-none relative z-[1] flex max-h-[min(90dvh,920px)] w-full flex-col overflow-y-auto text-left ${ATMOSPHERE_PANEL}`}
            >
              {/* Question copy only while the user is answering or the examiner is
                  thinking — never during feedback, or it ghosts behind the verdict. */}
              {sessionPhase !== "feedback" && (
                <motion.div
                  animate={{
                    opacity: evaluating ? 0.5 : 1,
                  }}
                  transition={{
                    duration: transitionMs(reduceMotion, 1.2),
                    ease: cinematicEase,
                  }}
                >
                  <h1 className="mt-1 font-serif text-[1.45rem] font-medium italic leading-[1.22] tracking-[0.01em] text-[#f7f2ea] sm:text-[1.65rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>

                  <p className="mt-4 max-w-[min(100%,34rem)] text-[0.8rem] font-light leading-[1.62] text-white/[0.44] sm:text-[0.84rem]">
                    {item.scenario}
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
                      duration: transitionMs(reduceMotion, 0.55),
                      ease: cinematicEase,
                    }}
                    className="mt-1 w-full pt-2"
                  >
                    <label htmlFor="oral-answer" className="sr-only">
                      Your answer
                    </label>
                    <textarea
                      ref={answerRef}
                      id="oral-answer"
                      rows={3}
                      readOnly={evaluating}
                      placeholder="Talk to me like we’re across the table."
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
                      className="oral-answer-line box-border min-h-[3.5rem] max-h-[min(18vh,7rem)] w-full resize-none border-0 bg-transparent pb-2 pl-0 pr-1 pt-0.5 text-[0.9rem] leading-[1.55] text-[#ebe6dc] sm:text-[0.95rem]"
                    />
                    <div className="pointer-events-none mt-1.5" aria-hidden>
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#d9ccb7]/26 to-transparent" />
                      <div className="mx-auto mt-0.5 h-px w-[82%] bg-gradient-to-r from-transparent via-[#a99373]/16 to-transparent" />
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
                      className={`flex items-center justify-between gap-3 ${
                        answerError ? "mt-3" : "mt-2.5"
                      }`}
                    >
                      {!evaluating ? (
                        <button
                          type="button"
                          onClick={runShowMe}
                          className="-ml-0.5 rounded-sm text-[0.78rem] font-normal italic tracking-[0.004em] text-white/45 outline-none transition-colors duration-200 ease-out hover:text-[#f2e8d8]/85 focus-visible:text-[#f2e8d8]/85 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/35"
                        >
                          Show me
                        </button>
                      ) : (
                        <span />
                      )}
                      {evaluating ? (
                        <div className="flex items-center gap-2.5">
                          <span className="sr-only" role="status" aria-live="polite">
                            Examiner is considering your response.
                          </span>
                          {showThinkingCue ? (
                            <>
                              <motion.div
                                aria-hidden
                                className="h-px w-10 origin-right bg-gradient-to-l from-[#d3c4ad]/30 to-transparent"
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
                                className="rounded-md border border-[#d8c7ad]/26 bg-black/24 px-2.5 py-1 font-serif text-[0.84rem] italic tracking-[0.01em] text-[#f1e8da]/92 sm:text-[0.88rem]"
                                animate={reduceMotion ? undefined : { opacity: [0.55, 0.9, 0.55] }}
                                transition={{
                                  duration: transitionMs(reduceMotion, 1.35),
                                  ease: "easeInOut",
                                  repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                                }}
                              >
                                Hold on. Let me think about that.
                              </motion.p>
                            </>
                          ) : (
                            <p
                              aria-hidden
                              className="rounded-md border border-[#d8c7ad]/20 bg-black/20 px-2.5 py-1 font-serif text-[0.84rem] italic tracking-[0.01em] text-[#efe4d3]/78 sm:text-[0.88rem]"
                            >
                              …
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[0.82rem] font-medium text-[#f2e8d8]/96">
                          When you’re ready.
                        </p>
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
                      duration: transitionMs(reduceMotion, 0.9),
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
                            className={`text-[0.9rem] leading-[1.72] text-[#c4beb4]/96 sm:text-[0.95rem] ${
                              isFirst ? "mt-6" : "mt-5"
                            }`}
                          >
                            {segment}
                          </motion.p>
                        );
                      })}
                    </div>

                    <AnimatePresence initial={false}>
                      {allSegmentsRevealed && showDeeper && (
                        <motion.div
                          key="deeper"
                          className="flex flex-col"
                          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                          transition={{
                            duration: transitionMs(reduceMotion, 0.55),
                            ease: cinematicEase,
                          }}
                        >
                          {item.evaluation.deeperExplanation.map((line, index) => (
                            <motion.p
                              key={`${item.id}-deeper-${index}`}
                              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.7),
                                delay: reduceMotion
                                  ? 0
                                  : 0.28 +
                                    index *
                                      (0.42 +
                                        jitterFromSeed(line.length + index * 17) *
                                          0.18),
                                ease: cinematicEase,
                              }}
                              className={`text-[0.88rem] leading-[1.72] text-[#b9b3a9]/92 sm:text-[0.92rem] ${
                                index === 0 ? "mt-5" : "mt-4"
                              }`}
                            >
                              {line}
                            </motion.p>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {allSegmentsRevealed && (
                      <motion.div
                        className="mt-6 flex items-center justify-between gap-3 pb-0.5"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: transitionMs(reduceMotion, 0.6),
                          delay: reduceMotion ? 0 : 0.35,
                          ease: cinematicEase,
                        }}
                      >
                        <button
                          type="button"
                          onClick={toggleDeeper}
                          aria-expanded={showDeeper}
                          className="-ml-0.5 rounded-sm text-[0.78rem] font-normal italic tracking-[0.004em] text-white/45 outline-none transition-colors duration-200 ease-out hover:text-[#f2e8d8]/85 focus-visible:text-[#f2e8d8]/85 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/35"
                        >
                          {showDeeper ? "That’s enough" : "Explain more"}
                        </button>
                        <AnimatePresence initial={false}>
                          {showTransitionCue && !showDeeper && (
                            <motion.button
                              key="continue"
                              type="button"
                              onClick={advanceFromFeedback}
                              initial={reduceMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={reduceMotion ? undefined : { opacity: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.7),
                                ease: cinematicEase,
                              }}
                              className="rounded-sm text-[0.82rem] font-medium text-[#efe4d3]/96 outline-none transition-colors duration-200 ease-out hover:text-[#f8efe4] focus-visible:text-[#f8efe4] focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/35"
                            >
                              All right. Let’s move on.
                              <span className="ml-2 text-[0.72rem] font-light italic text-white/40">
                                (Enter)
                              </span>
                            </motion.button>
                          )}
                          {showDeeper && (
                            <motion.button
                              key="continue-deeper"
                              type="button"
                              onClick={advanceFromFeedback}
                              initial={reduceMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={reduceMotion ? undefined : { opacity: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.5),
                                ease: cinematicEase,
                              }}
                              className="rounded-sm text-[0.78rem] font-normal italic tracking-[0.004em] text-white/45 outline-none transition-colors duration-200 ease-out hover:text-[#f2e8d8]/85 focus-visible:text-[#f2e8d8]/85 focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/35"
                            >
                              Continue
                              <span className="ml-2 text-[0.72rem] font-light text-white/35">
                                (Enter)
                              </span>
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
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
      className={`absolute right-2 top-1 z-10 h-7 w-7 rounded-full outline-none transition-colors duration-300 ease-out focus-visible:ring-1 focus-visible:ring-[#d8c7ad]/40 sm:right-3 sm:top-2 ${
        marked
          ? "text-[#e9c886]/90 hover:text-[#f1d49a]"
          : "text-white/35 hover:text-[#d8c7ad]/75"
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
    const verdictClass = teaching
      ? "text-[#f8efe4]"
      : value <= 1
        ? "text-[#f2cfca] sm:text-[#ecc7bf]"
        : value === 2
          ? "text-[#efe5cf]"
          : "text-[#f8efe4]";

    return (
      <div className="mt-2 flex shrink-0 flex-col items-stretch text-left">
        <motion.h2
          id={id}
          className={`max-w-[100%] font-serif text-[2.18rem] font-semibold leading-[1.02] tracking-[0.012em] transition-all duration-[700ms] ease-out sm:text-[2.5rem] ${verdictClass} ${
            settled && !reduceMotion ? "translate-y-[1px] opacity-[0.9]" : ""
          }`}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.34),
            ease: [0.2, 0.72, 0.24, 1] as const,
          }}
          style={{
            textShadow: teaching
              ? "0 10px 32px rgba(32,24,14,0.30), 0 2px 10px rgba(32,24,14,0.22)"
              : value <= 1
                ? "0 12px 38px rgba(64,16,12,0.44), 0 2px 10px rgba(64,16,12,0.32)"
                : value === 2
                  ? "0 10px 34px rgba(58,40,14,0.34), 0 2px 10px rgba(58,40,14,0.24)"
                  : "0 10px 32px rgba(32,24,14,0.30), 0 2px 10px rgba(32,24,14,0.22)",
          }}
        >
          {verdictLine(value, teaching)}
        </motion.h2>

        <motion.div
          className="flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: followDelay,
            duration: transitionMs(reduceMotion, 0.72),
            ease: cinematicEase,
          }}
        >
          <div
            className="mt-6 h-px w-full max-w-[min(100%,18rem)] bg-gradient-to-r from-[#a08050]/28 via-[#a08050]/10 to-transparent"
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
function mergeNotes(items: readonly string[]) {
  return items.join(" ");
}

/**
 * Three spoken-style segments the examiner delivers after the verdict.
 *
 * Evaluation mode (default):
 *   1) Acknowledge what was correct
 *   2) State what is missing
 *   3) Clarify the expectation / standard (with brief why)
 *
 * Teaching mode (user asked "Show Me"):
 *   1) Intro — the examiner shifts into teaching voice
 *   2) The strong answer itself
 *   3) Why it matters
 */
function composeExplanationSegments(
  evaluation: EvaluationBlock,
  teaching: boolean = false,
): [string, string, string] {
  if (teaching) {
    return [
      "All right — here’s what I’m listening for on this one.",
      evaluation.stronger.trim(),
      evaluation.why.trim(),
    ];
  }
  const acknowledge = mergeNotes(evaluation.correct).trim();
  const missing = mergeNotes(evaluation.missed).trim();
  const standard = [evaluation.stronger, evaluation.why]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return [acknowledge, missing, standard];
}

function evaluateAnswer(item: OralItem, answer: string): EvaluationBlock {
  const rubric = rubricByItem[item.id] ?? [];
  const normalized = normalize(answer);
  const matched = rubric.filter((point) =>
    point.keywords.some((keyword) => normalized.includes(normalize(keyword))),
  );
  const missed = rubric.filter((point) => !matched.includes(point));
  const coverage = rubric.length === 0 ? 0 : matched.length / rubric.length;

  const verdict =
    coverage >= 0.75
      ? { score: 3 as ScoreValue, outcomeLabel: "Examiner assessment", judgment: "Satisfactory" }
      : coverage >= 0.45
        ? { score: 2 as ScoreValue, outcomeLabel: "Examiner assessment", judgment: "Adequate, but incomplete" }
        : { score: 1 as ScoreValue, outcomeLabel: "Examiner assessment", judgment: "Unsatisfactory" };

  const correct =
    matched.length > 0
      ? [
          `All right — you got to ${listToPhrase(matched.slice(0, 2).map((x) => x.label))}. That part’s there.`,
          "It’s a start. But I’m not at a full checkride answer yet.",
        ]
      : ["I didn’t hear the core pieces I need for this one."];

  const missing =
    missed.length > 0
      ? [
          `I still needed you to walk me through ${listToPhrase(missed.slice(0, 3).map((x) => x.label))}.`,
          "Without those, I can’t call this a defensible checkride decision.",
        ]
      : ["You covered the backbone. Now tighten your precision and your delivery under pressure."];

  const stronger =
    missed.length > 0
      ? `A complete answer walks me through ${listToPhrase(
          missed.slice(0, 4).map((x) => x.label),
        )} in a clean sequence — and I shouldn’t have to pull it out of you.`
      : "Keep the structure. But tighten the language and the sequence so your judgment still reads clean when I interrupt you.";

  const examinerNote = buildExaminerNote(verdict.judgment);

  return {
    score: verdict.score,
    outcomeLabel: verdict.outcomeLabel,
    judgment: verdict.judgment,
    examinerNote,
    correct,
    missed: missing,
    stronger,
    why: item.evaluation.why,
    deeperExplanation: item.evaluation.deeperExplanation,
  };
}

/** Supporting copy only — verdict line is shown separately above. */
function buildExaminerNote(judgment: string) {
  if (judgment === "Satisfactory") {
    return "That was a complete decision process — and it held up under pressure. Good.";
  }
  if (judgment === "Adequate, but incomplete") {
    return "You’re on the right track. But there are gaps here that keep it from being a complete oral answer.";
  }
  return "From what you just gave me, I can’t say you have a complete decision process yet.";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function listToPhrase(items: readonly string[]) {
  if (items.length === 0) return "the critical factors for this scenario";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
