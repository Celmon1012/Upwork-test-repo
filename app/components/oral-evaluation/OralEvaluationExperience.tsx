"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEBRIEF_LABELS,
  EVALUATING_BEATS,
  EVALUATING_MS,
  ORAL_ITEMS,
  UI,
  type ScoreValue,
} from "./content";

const scoreNumeralColor: Record<ScoreValue, string> = {
  0: "#c97a7a",
  1: "#b89248",
  2: "#b8892a",
  3: "#6bb892",
};

type SessionPhase = "respond" | "evaluating" | "feedback";

const easeOut = [0.22, 1, 0.36, 1] as const;

function transitionMs(reduce: boolean | null, ms: number) {
  return reduce ? 0 : ms;
}

export function OralEvaluationExperience() {
  const reduceMotion = useReducedMotion();
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [itemIndex, setItemIndex] = useState(0);
  const [evalBeat, setEvalBeat] = useState<string>(EVALUATING_BEATS[0]!);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();

  const item = ORAL_ITEMS[itemIndex]!;
  const evaluation = item.evaluation;

  const runEvaluation = useCallback(() => {
    const answer = answerRef.current?.value.trim() ?? "";
    if (!answer) {
      setAnswerError("I need an answer before I can assess you.");
      answerRef.current?.focus();
      return;
    }
    setAnswerError(null);
    setEvalBeat(
      EVALUATING_BEATS[
        Math.floor(Math.random() * EVALUATING_BEATS.length)
      ]!,
    );
    setSessionPhase("evaluating");
    window.setTimeout(() => {
      setSessionPhase("feedback");
    }, EVALUATING_MS);
  }, []);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    if (answerRef.current) answerRef.current.value = "";
    setItemIndex((i) => (i + 1) % ORAL_ITEMS.length);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#03050a]">
      <BackgroundStack phase={sessionPhase} />

      <div className="oral-eval-scale relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-5">
          <AnimatePresence mode="wait">
            {showQuestionChrome && (
              <motion.div
                key={item.id}
                role="region"
                aria-label="Oral examination question"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={
                  reduceMotion
                    ? { opacity: evaluating ? 0.35 : 1 }
                    : {
                        opacity: evaluating ? 0.35 : 1,
                        filter: evaluating ? "blur(2px)" : "blur(0px)",
                      }
                }
                exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: transitionMs(reduceMotion, 0.55), ease: easeOut }}
                className="relative mx-auto w-full max-w-[min(100%,32rem)]"
              >
                <div
                  className="pointer-events-none absolute -left-4 top-0 hidden h-[min(100%,24rem)] w-px bg-gradient-to-b from-[#8b7355]/35 via-[#8b7355]/12 to-transparent sm:block"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -inset-x-10 -inset-y-8 bg-[radial-gradient(ellipse_85%_75%_at_40%_25%,rgba(255,245,230,0.04)_0%,transparent_58%)] opacity-90"
                  aria-hidden
                />

                <motion.div
                  className="relative z-[1] flex w-full flex-col text-left"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: transitionMs(reduceMotion, 0.45),
                    ease: easeOut,
                  }}
                >
                  <p className="text-[0.58rem] font-medium uppercase tracking-[0.38em] text-white/[0.22]">
                    {UI.oralEvaluation}
                    <span className="text-white/[0.12]"> · </span>
                    <span className="text-[#9a8a72]/90">{item.contextLabel}</span>
                  </p>

                  <p className="mt-3 text-[0.52rem] font-light tracking-[0.06em] text-white/[0.18]">
                    {itemIndex === 0
                      ? `First of ${ORAL_ITEMS.length} prompts in this set.`
                      : itemIndex === ORAL_ITEMS.length - 1
                        ? `Last prompt in this set (${ORAL_ITEMS.length} total).`
                        : `Prompt ${itemIndex + 1} of ${ORAL_ITEMS.length}.`}
                  </p>

                  <h1 className="mt-4 font-serif text-[1.45rem] font-medium leading-[1.22] tracking-[0.01em] text-[#f7f2ea] sm:text-[1.65rem] sm:leading-[1.18]">
                    {item.promptLine}
                  </h1>

                  <p className="mt-3 text-[0.78rem] font-light leading-[1.55] text-white/[0.38] sm:text-[0.82rem]">
                    {item.scenario}
                  </p>

                  <div className="mt-6 w-full">
                    <label htmlFor="oral-answer" className="sr-only">
                      Your answer
                    </label>
                    <textarea
                      ref={answerRef}
                      id="oral-answer"
                      rows={3}
                      placeholder="Answer as you would to an examiner across the table…"
                      aria-invalid={Boolean(answerError)}
                      aria-describedby={answerError ? "oral-answer-error" : undefined}
                      onChange={() => {
                        if (answerError) setAnswerError(null);
                      }}
                      className={`oral-answer-line box-border min-h-[4.25rem] max-h-[min(22vh,9rem)] w-full resize-none border-0 border-b bg-transparent pb-2 pl-0 pr-1 pt-0.5 text-[0.88rem] leading-[1.5] text-[#ebe6dc] sm:text-[0.9rem] ${
                        answerError
                          ? "border-b border-rose-500/40"
                          : "border-b border-white/[0.14] focus:border-b-[#7d6548]/55"
                      }`}
                    />
                    {answerError && (
                      <p
                        id="oral-answer-error"
                        className="mt-2.5 text-[0.74rem] font-light italic text-rose-200/65"
                        role="alert"
                      >
                        {answerError}
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={runEvaluation}
                      className="inline-flex h-9 min-w-[12rem] max-w-full items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 text-[0.62rem] font-medium tracking-[0.14em] text-stone-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,color,transform] hover:border-white/[0.22] hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89878]/45 active:scale-[0.99] sm:px-6 sm:text-[0.65rem] sm:tracking-[0.16em]"
                    >
                      I’m finished — assess my answer
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {evaluating && (
              <motion.div
                key="evaluating"
                role="status"
                aria-live="polite"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: transitionMs(reduceMotion, 0.45), ease: easeOut }}
                className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/38 backdrop-blur-[3px]"
              >
                <p className="max-w-[min(100%,26rem)] px-8 text-center font-serif text-[0.98rem] font-normal italic leading-relaxed text-[#d4cbc0] sm:text-[1.05rem]">
                  {evalBeat}
                </p>
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
                initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: transitionMs(reduceMotion, 0.4),
                  ease: easeOut,
                }}
                className="oral-verdict-record feedback-outcome relative z-20 my-auto w-full max-w-[min(100%,min(96vw,58rem))] shrink-0 self-center overflow-hidden rounded-sm"
              >
                <div className="oral-scrollbar-none flex max-h-[min(90dvh,920px)] flex-col overflow-y-auto px-4 pb-4 pt-4 sm:px-7 sm:pb-5 sm:pt-5">
                  <JudgmentBlock
                    id={dialogLabelId}
                    value={evaluation.score}
                    outcomeLabel={evaluation.outcomeLabel}
                    judgment={evaluation.judgment}
                    examinerNote={evaluation.examinerNote}
                  />

                  <div
                    className="mx-auto mt-2.5 h-px max-w-[12rem] shrink-0 bg-gradient-to-r from-transparent via-[#8b7355]/32 to-transparent sm:mt-3"
                    aria-hidden
                  />

                  <div className="mt-2.5 grid min-h-0 shrink grid-cols-1 gap-x-10 gap-y-2.5 md:grid-cols-2 md:gap-y-2">
                    <section className="min-h-0">
                      <DebriefHeading>{DEBRIEF_LABELS.correct}</DebriefHeading>
                      <FeedbackProse items={evaluation.correct} />
                    </section>
                    <section className="min-h-0">
                      <DebriefHeading>{DEBRIEF_LABELS.missed}</DebriefHeading>
                      <FeedbackProse items={evaluation.missed} />
                    </section>
                  </div>

                  <section className="mt-4 min-h-0 shrink rounded-sm border border-white/[0.07] bg-black/10 px-5 py-5 sm:mt-5 sm:px-7 sm:py-6">
                    <DebriefHeading>{DEBRIEF_LABELS.stronger}</DebriefHeading>
                    <p className="mt-4 text-[0.875rem] leading-[1.55] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      {evaluation.stronger}
                    </p>
                  </section>

                  <section className="mt-4 min-h-0 shrink rounded-sm border border-white/[0.07] bg-black/10 px-5 py-5 sm:mt-5 sm:px-7 sm:py-6">
                    <DebriefHeading>{DEBRIEF_LABELS.why}</DebriefHeading>
                    <p className="mt-4 text-[0.875rem] leading-[1.55] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      {evaluation.why}
                    </p>
                  </section>

                  <div className="mt-2.5 flex shrink-0 justify-center border-t border-white/[0.06] pt-2.5">
                    <button
                      type="button"
                      onClick={advanceFromFeedback}
                      className="inline-flex h-10 min-w-[11rem] max-w-full items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] px-6 text-[0.68rem] font-medium tracking-[0.12em] text-stone-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,color,transform] hover:border-white/[0.22] hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89878]/45 active:scale-[0.99] sm:tracking-[0.14em]"
                    >
                      Next oral item
                    </button>
                  </div>
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
            ? "scale-[1.06] brightness-[0.34] blur-[5px]"
            : respond
              ? "scale-[1.05] brightness-[0.32] blur-[5px]"
              : "brightness-[0.44] blur-[4px]"
        }`}
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b from-[#0a1020]/55 via-transparent transition-opacity duration-1000 ${
          evaluating || feedback
            ? "to-[#020308]/96 opacity-100"
            : respond
              ? "to-[#010206]/94 opacity-100"
              : "to-[#03050a]/88 opacity-100"
        }`}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_40%,transparent_15%,rgba(0,0,0,0.72)_100%)]"
        aria-hidden
      />
      {respond && !evaluating && (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_72%_58%_at_38%_42%,transparent_0%,rgba(0,0,0,0.52)_100%)]"
          aria-hidden
        />
      )}
      {(evaluating || feedback) && (
        <div
          className="absolute inset-0 bg-black/25 transition-opacity duration-1000"
          aria-hidden
        />
      )}
      {evaluating && (
        <div
          className="absolute inset-0 bg-amber-950/[0.07] mix-blend-overlay"
          aria-hidden
        />
      )}
      {feedback && (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,transparent_0%,rgba(0,0,0,0.42)_100%)]"
          aria-hidden
        />
      )}
      <div className="oral-grain absolute inset-0 opacity-[0.045]" aria-hidden />
    </div>
  );
}

function JudgmentBlock({
  id,
  value,
  outcomeLabel,
  judgment,
  examinerNote,
}: {
  id: string;
  value: ScoreValue;
  outcomeLabel: string;
  judgment: string;
  examinerNote: string;
}) {
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
        className="mt-3 h-px w-[min(100%,13rem)] bg-gradient-to-r from-transparent via-[#a08050]/35 to-transparent"
        aria-hidden
      />

      <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-0.5">
        <span
          className="font-serif text-[2rem] font-light tabular-nums leading-none sm:text-[2.15rem]"
          style={{
            fontFamily:
              "var(--font-cormorant), var(--font-cinzel), ui-serif, serif",
            color: scoreNumeralColor[value],
          }}
        >
          {value}
        </span>
        <span className="font-serif text-[1rem] font-light tabular-nums leading-none text-white/[0.28]">
          / 3
        </span>
        <span className="mx-0.5 text-[0.7rem] text-white/[0.15]" aria-hidden>
          ·
        </span>
        <span className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[#a09078]/95 sm:text-[0.65rem]">
          {outcomeLabel}
        </span>
      </div>

      <blockquote className="mx-auto mt-3 w-full max-w-none border-l-2 border-[#6b5340]/35 pl-3.5 text-left sm:pl-5">
        <p className="text-[0.875rem] font-light italic leading-[1.5] text-[#aea598]/95 sm:text-[0.9rem]">
          {examinerNote}
        </p>
      </blockquote>
    </div>
  );
}

function FeedbackProse({ items }: { items: readonly string[] }) {
  return (
    <div className="mt-2 space-y-2">
      {items.map((line, i) => (
        <p
          key={`${i}-${line.slice(0, 48)}`}
          className="border-l border-white/[0.08] pl-2.5 text-left text-[0.875rem] leading-[1.5] text-[#c4beb4]/95 sm:pl-3 sm:text-[0.9rem]"
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function DebriefHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-serif text-[0.9rem] font-medium italic leading-snug text-[#a89880]/95 sm:text-[0.95rem]">
      {children}
    </h3>
  );
}
