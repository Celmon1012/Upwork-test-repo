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
} from "react";
import {
  EVALUATING_MS,
  ORAL_ITEMS,
  UI,
  type EvaluationBlock,
  type OralItem,
  type ScoreValue,
} from "./content";

const scoreNumeralColor: Record<ScoreValue, string> = {
  0: "#c97a7a",
  1: "#b89248",
  2: "#b8892a",
  3: "#6bb892",
};

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

export function OralEvaluationExperience() {
  const reduceMotion = useReducedMotion();
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [itemIndex, setItemIndex] = useState(0);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [evaluated, setEvaluated] = useState<EvaluationBlock | null>(null);
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
    setSessionPhase("evaluating");
    window.setTimeout(() => {
      setSessionPhase("feedback");
    }, EVALUATING_MS);
  }, [item]);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    if (answerRef.current) answerRef.current.value = "";
    setItemIndex((i) => (i + 1) % ORAL_ITEMS.length);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#03050a]">
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
                aria-label="Oral examination question"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={
                  reduceMotion
                    ? { opacity: evaluating ? 0.2 : 1 }
                    : {
                        opacity: evaluating ? 0.22 : 1,
                        y: evaluating ? -2 : 0,
                      }
                }
                exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: transitionMs(reduceMotion, 0.6), ease: cinematicEase }}
                className="relative mx-auto w-full max-w-[min(100%,35rem)]"
              >
                <div
                  className="pointer-events-none absolute -inset-x-10 -inset-y-8 bg-[radial-gradient(ellipse_85%_75%_at_40%_25%,rgba(255,245,230,0.04)_0%,transparent_58%)] opacity-90"
                  aria-hidden
                />

                <motion.div
                  className="relative z-[1] flex w-full flex-col text-left"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: transitionMs(reduceMotion, 0.5),
                    ease: cinematicEase,
                  }}
                >
                  <p className="text-[0.58rem] font-medium uppercase tracking-[0.38em] text-white/[0.22]">
                    {UI.oralEvaluation}
                    <span className="text-white/[0.12]"> · </span>
                    <span className="text-[#9a8a72]/90">{item.contextLabel}</span>
                  </p>

                  <p className="mt-4 text-[0.58rem] font-light uppercase tracking-[0.24em] text-[#b9aa93]/80">
                    Examiner asks
                  </p>

                  <h1 className="mt-2 font-serif text-[1.45rem] font-medium italic leading-[1.22] tracking-[0.01em] text-[#f7f2ea] sm:text-[1.65rem] sm:leading-[1.18]">
                    {`"${item.promptLine}"`}
                  </h1>

                  <p className="mt-3 rounded-sm border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[0.78rem] font-light leading-[1.55] text-white/[0.38] sm:text-[0.82rem]">
                    {item.scenario}
                  </p>

                  <div className="mt-6 w-full">
                    <p className="mb-2 text-[0.62rem] font-light uppercase tracking-[0.14em] text-[#b9aa93]/70">
                      Respond exactly as you would in the room.
                    </p>
                    <label htmlFor="oral-answer" className="sr-only">
                      Your answer
                    </label>
                    <textarea
                      ref={answerRef}
                      id="oral-answer"
                      rows={2}
                      placeholder="Answer as you would to an examiner across the table…"
                      aria-invalid={Boolean(answerError)}
                      aria-describedby={answerError ? "oral-answer-error" : undefined}
                      onChange={() => {
                        if (answerError) setAnswerError(null);
                      }}
                      className="oral-answer-line box-border min-h-[3.5rem] max-h-[min(18vh,7rem)] w-full resize-none border-0 bg-transparent pb-2 pl-0 pr-1 pt-0.5 text-[0.9rem] leading-[1.55] text-[#ebe6dc] sm:text-[0.95rem]"
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

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={runEvaluation}
                      className="inline-flex h-9 min-w-[12rem] max-w-full items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 text-[0.62rem] font-medium tracking-[0.14em] text-stone-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,color,transform] hover:border-white/[0.22] hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89878]/45 active:scale-[0.99] sm:px-6 sm:text-[0.65rem] sm:tracking-[0.16em]"
                    >
                      I’m ready.
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
                transition={{ duration: transitionMs(reduceMotion, 0.24), ease: cinematicEase }}
                className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[4px]"
              >
                <motion.p
                  className="max-w-[min(100%,26rem)] px-8 text-center font-serif text-[0.95rem] font-normal italic leading-relaxed text-[#d4cbc0]/94 sm:text-[1.02rem]"
                  animate={reduceMotion ? undefined : { opacity: [0.65, 1, 0.65] }}
                  transition={{
                    duration: transitionMs(reduceMotion, 1.8),
                    ease: "easeInOut",
                    repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
                  }}
                >
                  Evaluating your response…
                </motion.p>
                <p className="mt-5 text-[0.58rem] font-light uppercase tracking-[0.25em] text-white/[0.18]">
                  Stand by.
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
                  className="pointer-events-none absolute -inset-x-10 -inset-y-8 bg-[radial-gradient(ellipse_85%_75%_at_40%_25%,rgba(255,245,230,0.04)_0%,transparent_58%)] opacity-90"
                  aria-hidden
                />

                <div className="oral-scrollbar-none relative z-[1] flex max-h-[min(90dvh,920px)] flex-col overflow-y-auto text-left">
                  <p className="text-[0.58rem] font-medium uppercase tracking-[0.38em] text-white/[0.22]">
                    {UI.oralEvaluation}
                    <span className="text-white/[0.12]"> · </span>
                    <span className="text-[#9a8a72]/90">{item.contextLabel}</span>
                  </p>

                  <JudgmentBlock
                    id={dialogLabelId}
                    value={evaluation.score}
                    outcomeLabel={evaluation.outcomeLabel}
                    judgment={evaluation.judgment}
                    examinerNote={evaluation.examinerNote}
                    align="immersive"
                  />

                  <p className="mt-5 text-[0.58rem] font-light uppercase tracking-[0.24em] text-[#b9aa93]/80">
                    Examiner continues
                  </p>

                  <div className="mt-3 rounded-sm border border-white/[0.12] bg-white/[0.03] px-3 py-3 sm:px-4 sm:py-3.5">
                    <p className="text-[0.875rem] leading-[1.65] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      <span className="font-medium text-[#d8cfc4]">- What was correct: </span>
                      {mergeNotes(evaluation.correct)}
                    </p>
                    <p className="mt-3 text-[0.875rem] leading-[1.65] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      <span className="font-medium text-[#d8cfc4]">- What was missed: </span>
                      {mergeNotes(evaluation.missed)}
                    </p>
                    <p className="mt-3 text-[0.875rem] leading-[1.65] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      <span className="font-medium text-[#d8cfc4]">- Stronger answer: </span>
                      {evaluation.stronger}
                    </p>
                    <p className="mt-3 text-[0.875rem] leading-[1.65] text-[#c4beb4]/95 sm:text-[0.9rem]">
                      <span className="font-medium text-[#d8cfc4]">- Why it matters: </span>
                      {evaluation.why}
                    </p>
                  </div>

                  <div className="mt-6 flex shrink-0 justify-end pb-1">
                    <button
                      type="button"
                      onClick={advanceFromFeedback}
                      className="inline-flex h-9 min-w-[11rem] max-w-full items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 text-[0.62rem] font-medium tracking-[0.14em] text-stone-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,color,transform] hover:border-white/[0.22] hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89878]/45 active:scale-[0.99] sm:px-6 sm:text-[0.65rem] sm:tracking-[0.16em]"
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
  align = "centered",
}: {
  id: string;
  value: ScoreValue;
  outcomeLabel: string;
  judgment: string;
  examinerNote: string;
  align?: "centered" | "immersive";
}) {
  const immersive = align === "immersive";

  return (
    <div
      className={
        immersive
          ? "mt-4 flex shrink-0 flex-col items-stretch text-left"
          : "flex shrink-0 flex-col items-center text-center"
      }
    >
      <p className="text-[0.58rem] font-normal uppercase tracking-[0.32em] text-white/[0.22]">
        Examiner record
      </p>

      <h2
        id={id}
        className={`mt-2.5 max-w-[99%] font-serif text-[1.5rem] font-semibold leading-[1.1] tracking-[0.01em] text-[#eee6dc] sm:text-[1.7rem] ${immersive ? "italic" : ""}`}
      >
        {immersive ? `“${judgment}.”` : judgment}
      </h2>

      <div
        className={`mt-3 h-px bg-gradient-to-r from-transparent via-[#a08050]/35 to-transparent ${immersive ? "w-full max-w-none" : "mx-auto w-[min(100%,13rem)]"}`}
        aria-hidden
      />

      <div
        className={`mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 ${immersive ? "justify-start" : "justify-center"}`}
      >
        <span
          className="font-serif text-[2rem] font-light tabular-nums leading-none sm:text-[2.15rem]"
          style={{ color: scoreNumeralColor[value] }}
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

      <div className="mt-4 w-full rounded-sm border border-white/[0.12] bg-white/[0.03] px-3 py-2.5 sm:px-4">
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
      ? { score: 3 as ScoreValue, outcomeLabel: "Meets standard", judgment: "Adequate" }
      : coverage >= 0.45
        ? { score: 2 as ScoreValue, outcomeLabel: "Incomplete", judgment: "Adequate, but incomplete" }
        : { score: 1 as ScoreValue, outcomeLabel: "Below standard", judgment: "Unsatisfactory" };

  const correct =
    matched.length > 0
      ? [
          `You did identify ${listToPhrase(matched.slice(0, 2).map((x) => x.label))}.`,
          "Those points show situational awareness, but they were not enough on their own to close the item.",
        ]
      : ["Your response did not establish any of the required anchors for this scenario."];

  const missing =
    missed.length > 0
      ? [
          `What I still needed to hear was ${listToPhrase(missed.slice(0, 3).map((x) => x.label))}.`,
          "Without those pieces, the answer does not demonstrate a defensible checkride decision process.",
        ]
      : ["You covered the required pillars; minor tightening is about precision and delivery under pressure."];

  const stronger =
    missed.length > 0
      ? `A stronger answer would have explicitly walked through ${listToPhrase(
          missed.slice(0, 4).map((x) => x.label),
        )} in a clear sequence, without waiting for examiner prompts.`
      : "A stronger answer would keep the same structure but tighten language and sequencing so your judgment remains clear under interruption.";

  const examinerNote = buildExaminerNote(verdict.judgment, matched.length, rubric.length);

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

function buildExaminerNote(judgment: string, matchedCount: number, total: number) {
  if (judgment === "Adequate") {
    return `Adequate. You covered ${matchedCount} of ${total} decision anchors with enough structure that I can follow your judgment under checkride pressure.`;
  }
  if (judgment === "Adequate, but incomplete") {
    return `Adequate, but incomplete. You addressed ${matchedCount} of ${total} anchors, but the omissions are significant enough that I cannot treat this as a complete oral answer yet.`;
  }
  return `Unsatisfactory. You addressed ${matchedCount} of ${total} anchors, and I still cannot verify a complete, defensible decision process from your response.`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function listToPhrase(items: readonly string[]) {
  if (items.length === 0) return "the expected decision points";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
