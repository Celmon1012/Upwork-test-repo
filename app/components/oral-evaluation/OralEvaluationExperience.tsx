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
function verdictLine(score: ScoreValue): string {
  if (score >= 3) return "Satisfactory.";
  return "Not sufficient.";
}

/** Seconds before supporting note/debrief appear (verdict holds the screen). */
function judgmentFollowDelayS(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 0;
  if (score <= 1) return 1.35;
  if (score === 2) return 1.15;
  return 1.0;
}

function explanationRevealDelayMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 0;
  if (score <= 1) return 2600;
  if (score === 2) return 2400;
  return 2200;
}

function autoAdvanceDelayMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 4200;
  if (score <= 1) return 7600;
  if (score === 2) return 7000;
  return 6300;
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
  const [showExplanation, setShowExplanation] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();

  const item = ORAL_ITEMS[itemIndex]!;
  const evaluation = evaluated ?? item.evaluation;

  const runEvaluation = useCallback(() => {
    const answer = answerRef.current?.value.trim() ?? "";
    if (!answer) {
      setAnswerError("I need an answer before I can assess you.");
      answerRef.current?.focus();
      return;
    }
    setAnswerError(null);
    setEvaluated(evaluateAnswer(item, answer));
    setShowExplanation(false);
    setSessionPhase("evaluating");
    window.setTimeout(() => {
      setSessionPhase("feedback");
    }, EVALUATING_MS);
  }, [item]);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowExplanation(false);
    if (answerRef.current) answerRef.current.value = "";
    setItemIndex((i) => (i + 1) % ORAL_ITEMS.length);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

  useEffect(() => {
    if (sessionPhase === "respond") {
      answerRef.current?.focus();
    }
  }, [itemIndex, sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "feedback") {
      setShowExplanation(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowExplanation(true);
    }, explanationRevealDelayMs(reduceMotion, evaluation.score));
    return () => window.clearTimeout(timer);
  }, [evaluation.score, reduceMotion, sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "feedback") return;
    const timer = window.setTimeout(() => {
      advanceFromFeedback();
    }, autoAdvanceDelayMs(reduceMotion, evaluation.score));
    return () => window.clearTimeout(timer);
  }, [advanceFromFeedback, evaluation.score, reduceMotion, sessionPhase]);

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#0a1018]">
      <BackgroundStack phase={sessionPhase} />

      <div
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        style={{ zoom: 1.2 }}
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-5">
          <AnimatePresence mode="wait">
            {showQuestionChrome && (
              <motion.div
                key={item.id}
                role="region"
                aria-label={`${item.contextLabel} — examiner question`}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={
                  reduceMotion
                    ? { opacity: evaluating ? 0.38 : 1 }
                    : {
                        opacity: evaluating ? 0.38 : 1,
                        y: evaluating ? -2 : 0,
                      }
                }
                exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: transitionMs(reduceMotion, 0.6), ease: cinematicEase }}
                className="relative mx-auto w-full max-w-[min(100%,35rem)]"
              >
                <motion.div
                  className={`relative z-[1] flex w-full flex-col text-left ${ATMOSPHERE_PANEL}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: transitionMs(reduceMotion, 0.5),
                    ease: cinematicEase,
                  }}
                >
                  <h1 className="mt-1 font-serif text-[1.45rem] font-medium italic leading-[1.22] tracking-[0.01em] text-[#f7f2ea] sm:text-[1.65rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>

                  <p className="mt-4 max-w-[min(100%,34rem)] text-[0.8rem] font-light leading-[1.62] text-white/[0.44] sm:text-[0.84rem]">
                    {item.scenario}
                  </p>

                  <div className="mt-1 w-full pt-2">
                    <label htmlFor="oral-answer" className="sr-only">
                      Your answer
                    </label>
                    <textarea
                      ref={answerRef}
                      id="oral-answer"
                      rows={3}
                      readOnly={evaluating}
                      placeholder="State your answer. Press Enter to submit."
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
                      className={
                        answerError
                          ? "mt-3 flex justify-end"
                          : "mt-2.5 flex justify-end"
                      }
                    >
                      {evaluating ? (
                        <div className="flex items-center gap-2.5">
                          <span className="sr-only" role="status" aria-live="polite">
                            Examiner is considering your response.
                          </span>
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
                            className="font-serif text-[1rem] italic leading-none text-[#d7ccbc]/74"
                            animate={reduceMotion ? undefined : { opacity: [0.35, 0.9, 0.35], y: [0, -1.5, 0] }}
                            transition={{
                              duration: transitionMs(reduceMotion, 1.0),
                              ease: "easeInOut",
                              repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                            }}
                          >
                            …
                          </motion.span>
                        </div>
                      ) : (
                        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-[#c7baa4]/56">
                          Press Enter to submit.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {sessionPhase === "feedback" && (
              <motion.div
                key={`feedback-${item.id}`}
                role="dialog"
                aria-labelledby={dialogLabelId}
                aria-modal="true"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{
                  duration: transitionMs(reduceMotion, 0.48),
                  ease: cinematicEase,
                  delay: reduceMotion ? 0 : 0.12,
                }}
                className="relative z-20 mx-auto w-full max-w-[min(100%,35rem)] shrink-0"
              >
                <div
                  className={`oral-scrollbar-none relative z-[1] flex max-h-[min(90dvh,920px)] flex-col overflow-y-auto text-left ${ATMOSPHERE_PANEL}`}
                >
                  <span className="sr-only">{item.contextLabel}</span>

                  <JudgmentBlock
                    id={dialogLabelId}
                    value={evaluation.score}
                    judgment={evaluation.judgment}
                    examinerNote={evaluation.examinerNote}
                    align="immersive"
                  />

                  <AnimatePresence>
                    {showExplanation && (
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                        transition={{
                          duration: transitionMs(reduceMotion, 0.78),
                          ease: cinematicEase,
                        }}
                      >
                        <p className="mt-6 text-[0.9rem] leading-[1.72] text-[#c4beb4]/96 sm:text-[0.95rem]">
                          {composeContinuousEvaluationNarrative(evaluation)}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.div
                    className="mt-7 flex shrink-0 justify-end pb-0.5 pt-2"
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay:
                        explanationRevealDelayMs(reduceMotion, evaluation.score) / 1000 +
                        (reduceMotion ? 0.6 : 1.0),
                      duration: transitionMs(reduceMotion, 0.5),
                      ease: cinematicEase,
                    }}
                  >
                    <p className="text-[0.63rem] uppercase tracking-[0.12em] text-[#b9aa93]/52">
                      Next item loading…
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function BackgroundStack({ phase }: { phase: SessionPhase }) {
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
        className={`object-cover object-center transition-all duration-[1400ms] ease-out ${
          evaluating || feedback
            ? "scale-[1.03] brightness-[0.8]"
            : respond
              ? "scale-[1.02] brightness-[0.82]"
              : "brightness-[0.82]"
        }`}
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b from-[#0a1428]/32 via-[#050810]/10 transition-opacity duration-1000 ${
          evaluating || feedback
            ? "to-[#050810]/40 opacity-100"
            : respond
              ? "to-[#050810]/34 opacity-100"
              : "to-[#060a12]/28 opacity-100"
        }`}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_95%_75%_at_50%_38%,transparent_32%,rgba(5,8,16,0.24)_100%)]"
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
          className="absolute inset-0 bg-black/[0.05] transition-opacity duration-1000"
          aria-hidden
        />
      )}
      {evaluating && (
        <div
          className="absolute inset-0 bg-amber-950/[0.05] mix-blend-overlay"
          aria-hidden
        />
      )}
      {feedback && (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_72%_58%_at_50%_38%,transparent_0%,rgba(5,8,16,0.1)_100%)]"
          aria-hidden
        />
      )}
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
}: {
  id: string;
  value: ScoreValue;
  judgment: string;
  examinerNote: string;
  align?: "centered" | "immersive";
}) {
  const immersive = align === "immersive";
  const reduceMotion = useReducedMotion();
  const followDelay = judgmentFollowDelayS(reduceMotion, value);

  if (immersive) {
    const verdictClass =
      value <= 1
        ? "text-[#f2cfca] sm:text-[#ecc7bf]"
        : value === 2
          ? "text-[#efe5cf]"
          : "text-[#f8efe4]";

    return (
      <div className="mt-2 flex shrink-0 flex-col items-stretch text-left">
        <motion.h2
          id={id}
          className={`max-w-[100%] font-serif text-[2.06rem] font-semibold leading-[1.02] tracking-[0.018em] sm:text-[2.32rem] ${verdictClass}`}
          initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.72),
            ease: easeOut,
          }}
          style={{
            textShadow:
              value <= 1
                ? "0 10px 34px rgba(64,16,12,0.36)"
                : value === 2
                  ? "0 8px 30px rgba(58,40,14,0.28)"
                  : "0 8px 28px rgba(32,24,14,0.24)",
          }}
        >
          {verdictLine(value)}
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

function composeContinuousEvaluationChunks(evaluation: EvaluationBlock) {
  return [
    evaluation.examinerNote,
    mergeNotes(evaluation.correct),
    mergeNotes(evaluation.missed),
    evaluation.stronger,
    evaluation.why,
  ];
}

function composeContinuousEvaluationNarrative(evaluation: EvaluationBlock) {
  return composeContinuousEvaluationChunks(evaluation)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
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
          `You did identify ${listToPhrase(matched.slice(0, 2).map((x) => x.label))}.`,
          "That shows situational awareness, but the answer still does not stand as a complete checkride response.",
        ]
      : ["Your response did not establish the core elements I needed to hear for this scenario."];

  const missing =
    missed.length > 0
      ? [
          `What I still needed to hear was ${listToPhrase(missed.slice(0, 3).map((x) => x.label))}.`,
          "Without those pieces, the answer does not demonstrate a defensible checkride decision process.",
        ]
      : ["You covered the core decision elements; what remains is tightening precision and delivery under pressure."];

  const stronger =
    missed.length > 0
      ? `A complete answer would explicitly walk through ${listToPhrase(
          missed.slice(0, 4).map((x) => x.label),
        )} in a clear sequence, without waiting for examiner prompts.`
      : "A complete answer would keep the same structure while tightening language and sequencing so your judgment remains clear under interruption.";

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
  };
}

/** Supporting copy only — verdict line is shown separately above. */
function buildExaminerNote(judgment: string) {
  if (judgment === "Satisfactory") {
    return "Your response shows a complete and defensible decision process under checkride pressure.";
  }
  if (judgment === "Adequate, but incomplete") {
    return "You are directionally correct, but key omissions prevent this from being a complete oral answer.";
  }
  return "I still cannot verify a complete, defensible decision process from your response.";
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
