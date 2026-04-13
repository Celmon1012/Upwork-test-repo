"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CATEGORY,
  EVALUATION,
  SCENARIO,
  SKIPPED_EVALUATION,
  SKIP_TO_FEEDBACK_MS,
  SUBMIT_TO_FEEDBACK_MS,
  type ScoreValue,
} from "./content";

const dividerLineClass =
  "h-[2px] min-h-[2px] w-full shrink-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.12)_22%,rgba(255,255,255,0.38)_50%,rgba(255,255,255,0.12)_78%,transparent_100%)]";

const scoreAccent = {
  0: {
    glow: "text-[#f0a8a8]",
    ring: "shadow-[0_0_60px_rgba(244,67,54,0.35)]",
    bar: "from-rose-400/90 to-orange-300/80",
  },
  1: {
    glow: "text-[#f5c77a]",
    ring: "shadow-[0_0_56px_rgba(245,158,11,0.35)]",
    bar: "from-amber-400/90 to-yellow-300/75",
  },
  2: {
    glow: "text-[#f0d080]",
    ring: "shadow-[0_0_64px_rgba(229,169,89,0.45)]",
    bar: "from-[#e8b84c] to-[#c9a050]",
  },
  3: {
    glow: "text-[#9ae6b4]",
    ring: "shadow-[0_0_56px_rgba(74,222,128,0.4)]",
    bar: "from-emerald-400/95 to-teal-400/85",
  },
} as const;

type FeedbackVariant = "evaluation" | "skipped";

export function OralEvaluationExperience() {
  const [phase, setPhase] = useState<"input" | "feedback">("input");
  const [feedbackVariant, setFeedbackVariant] =
    useState<FeedbackVariant>("evaluation");
  const [inputExiting, setInputExiting] = useState(false);
  const [panelEntering, setPanelEntering] = useState(false);
  const [awaitingFeedback, setAwaitingFeedback] = useState(false);
  const [inputNotice, setInputNotice] = useState<
    "marked" | "review_later" | null
  >(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();

  /** Submit → full evaluation after ~1.5s (no spinner). */
  const handleSubmit = useCallback(() => {
    setFeedbackVariant("evaluation");
    setInputExiting(true);
    setAwaitingFeedback(true);
    window.setTimeout(() => {
      setPhase("feedback");
      setInputExiting(false);
      setAwaitingFeedback(false);
    }, SUBMIT_TO_FEEDBACK_MS);
  }, []);

  /** Skip → shorter delay, “skipped” panel (no numeric score). */
  const handleSkip = useCallback(() => {
    setFeedbackVariant("skipped");
    setInputExiting(true);
    setAwaitingFeedback(true);
    window.setTimeout(() => {
      setPhase("feedback");
      setInputExiting(false);
      setAwaitingFeedback(false);
    }, SKIP_TO_FEEDBACK_MS);
  }, []);

  /** Mark for Review → stay on this question; clear confirmation only. */
  const handleMarkForReview = useCallback(() => {
    setInputNotice("marked");
  }, []);

  useEffect(() => {
    if (phase !== "feedback") return;
    const id = window.requestAnimationFrame(() => {
      window.setTimeout(() => setPanelEntering(true), 48);
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const backToQuestion = useCallback((opts?: { reviewLater?: boolean }) => {
    setPhase("input");
    setPanelEntering(false);
    setFeedbackVariant("evaluation");
    if (answerRef.current) answerRef.current.value = "";
    if (opts?.reviewLater) setInputNotice("review_later");
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05070c]">
      <div className="pointer-events-none fixed inset-0 z-0">
        <Image
          src="/cockpit-bg.png"
          alt=""
          fill
          priority
          unoptimized
          className="object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#0c1828]/35 via-transparent to-[#04060a]/65"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_95%_70%_at_50%_45%,transparent_30%,rgba(0,0,0,0.5)_100%)]"
          aria-hidden
        />
        <div
          className="oral-grain absolute inset-0 opacity-[0.035]"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-10 sm:px-10 sm:py-12">
        {phase === "input" && (
          <div
            className={`flex w-full max-w-[min(100%,880px)] flex-col transition-[opacity,filter] motion-safe:duration-500 motion-safe:ease-out ${
              inputExiting
                ? "pointer-events-none opacity-0 blur-[2px]"
                : "opacity-100"
            }`}
            aria-busy={awaitingFeedback}
          >
            <h1 className="text-center font-serif text-[1.7rem] font-medium tracking-[0.28em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] sm:text-[1.85rem] lg:text-[2.05rem] xl:text-[2.25rem]">
              ORAL EVALUATION
            </h1>
            <div
              className={`mt-4 w-full ${dividerLineClass}`}
              role="separator"
              aria-hidden
            />
            <p className="mt-5 text-center text-[1.2rem] font-medium tracking-wide text-white/90 sm:text-[1.3rem]">
              {CATEGORY}
            </p>

            <p className="mt-12 w-full max-w-none text-center text-[1.02rem] font-light leading-[1.7] text-white/95 sm:text-[1.08rem] sm:leading-[1.75]">
              {SCENARIO}
            </p>

            <div className="mt-10 w-full">
              <label htmlFor="oral-answer" className="sr-only">
                Your answer
              </label>
              <textarea
                ref={answerRef}
                id="oral-answer"
                rows={8}
                placeholder="Type your response…"
                className="oral-input box-border min-h-[190px] w-full resize-y rounded-[2px] border border-white/20 bg-[rgba(22,28,42,0.58)] px-4 py-4 text-[0.95rem] leading-relaxed text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.25),0_8px_40px_rgba(0,0,0,0.3)] outline-none backdrop-blur-md placeholder:text-white/35 focus:border-white/30 focus:ring-2 focus:ring-white/15 sm:text-[0.98rem]"
              />
              <div className="mt-3 flex justify-center" aria-hidden>
                <svg
                  width="18"
                  height="10"
                  viewBox="0 0 18 10"
                  className="text-white/70"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 1.5L9 8.5L17 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {inputNotice && (
              <div
                role="status"
                className="mt-8 w-full rounded-[3px] border border-amber-400/25 bg-[rgba(28,26,18,0.88)] px-5 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              >
                <p className="text-[0.95rem] leading-relaxed text-amber-50/95 sm:text-[1rem]">
                  {inputNotice === "marked" ? (
                    <>
                      <span className="font-semibold text-amber-200">
                        Marked for review.
                      </span>{" "}
                      This question stays on your list. Answer and submit when
                      you are ready for a full evaluation.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-amber-200">
                        Saved for later review.
                      </span>{" "}
                      Come back to this prompt whenever you want to continue.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setInputNotice(null)}
                  className="mt-3 text-[0.85rem] font-medium tracking-wide text-white/70 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            <p className="mt-8 text-center text-[0.75rem] font-medium uppercase tracking-[0.28em] text-white/45">
              Submit for feedback · Skip without scoring · Mark to flag for
              later
            </p>

            <div className="mt-5 flex w-full flex-wrap items-stretch justify-center gap-4 sm:flex-nowrap sm:gap-5">
              <GlassButton type="button" onClick={handleSubmit}>
                Submit
              </GlassButton>
              <GlassButton type="button" onClick={handleSkip}>
                Skip
              </GlassButton>
              <GlassButton type="button" onClick={handleMarkForReview}>
                Mark for Review
              </GlassButton>
            </div>
          </div>
        )}

        {phase === "feedback" && (
          <div
            className="oral-glass-panel w-full max-w-[min(100%,880px)]"
            role="dialog"
            aria-labelledby={dialogLabelId}
            aria-modal="true"
          >
            <div
              className={`px-6 py-8 sm:px-9 sm:py-9 motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                panelEntering
                  ? "translate-y-0 opacity-100"
                  : "translate-y-3 opacity-0"
              }`}
            >
              {feedbackVariant === "evaluation" ? (
                <>
                  <ScoreBlock
                    id={dialogLabelId}
                    value={EVALUATION.score}
                    label={EVALUATION.scoreLabel}
                  />
                  <Divider spacing="belowScore" />
                  <SectionTitle className="mt-8">What was correct</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {EVALUATION.correct.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-[#5fd068]"
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">What was missed</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {EVALUATION.missed.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-[#e85d5d]"
                          aria-hidden
                        >
                          ✕
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">Stronger answer</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {EVALUATION.stronger}
                  </p>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">Why it matters</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {EVALUATION.why}
                  </p>
                </>
              ) : (
                <>
                  <SkippedScoreBlock
                    id={dialogLabelId}
                    headline={SKIPPED_EVALUATION.headline}
                    subline={SKIPPED_EVALUATION.subline}
                  />
                  <Divider spacing="belowScore" />
                  <SectionTitle className="mt-8">What was correct</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {SKIPPED_EVALUATION.correct.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-white/40"
                          aria-hidden
                        >
                          —
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">What was missed</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {SKIPPED_EVALUATION.missed.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-[#e8b86a]/90"
                          aria-hidden
                        >
                          !
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">Stronger answer</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {SKIPPED_EVALUATION.stronger}
                  </p>
                  <Divider spacing="afterBlock" />
                  <SectionTitle className="mt-8">Why it matters</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/[0.93] sm:text-[0.98rem]">
                    {SKIPPED_EVALUATION.why}
                  </p>
                </>
              )}

              <div className="mt-12 flex w-full flex-wrap items-stretch justify-center gap-4 sm:flex-nowrap sm:gap-5">
                <GlassButton type="button" onClick={() => backToQuestion()}>
                  Continue
                </GlassButton>
                <GlassButton
                  type="button"
                  onClick={() => backToQuestion({ reviewLater: true })}
                >
                  Review Later
                </GlassButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBlock({
  id,
  value,
  label,
}: {
  id: string;
  value: ScoreValue;
  label: string;
}) {
  const accent = scoreAccent[value];
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-white/[0.12] to-white/[0.02] ${accent.ring} sm:h-[5rem] sm:w-[5rem]`}
      >
        <span
          className={`font-serif text-[2.5rem] font-semibold tabular-nums leading-none tracking-tight sm:text-[2.75rem] ${accent.glow} drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]`}
        >
          {value}
        </span>
        <div
          className={`absolute -bottom-1 left-1/2 h-1 w-[40%] -translate-x-1/2 rounded-full bg-gradient-to-r ${accent.bar} opacity-90`}
          aria-hidden
        />
      </div>
      <p
        id={id}
        className="max-w-[26rem] text-center text-[1.05rem] font-semibold leading-snug text-[#e8c478] sm:text-[1.2rem]"
      >
        {label}
      </p>
    </div>
  );
}

function SkippedScoreBlock({
  id,
  headline,
  subline,
}: {
  id: string;
  headline: string;
  subline: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-white/20 bg-gradient-to-b from-white/[0.08] to-white/[0.02] shadow-[0_0_48px_rgba(251,191,36,0.12)] sm:h-[5rem] sm:w-[5rem]">
        <span
          className="font-serif text-[1.9rem] font-medium text-white/35 sm:text-[2.1rem]"
          aria-hidden
        >
          —
        </span>
      </div>
      <h2
        id={id}
        className="max-w-[24rem] text-[1.1rem] font-semibold tracking-wide text-amber-200/95 sm:text-[1.25rem]"
      >
        {headline}
      </h2>
      <p className="max-w-[30rem] text-[0.875rem] text-white/55 sm:text-[0.92rem]">
        {subline}
      </p>
    </div>
  );
}

function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-left text-[0.88rem] font-semibold tracking-wide text-white ${className}`}
    >
      {children}
    </h3>
  );
}

function Divider({
  spacing = "belowTitle",
}: {
  spacing?: "belowScore" | "belowTitle" | "afterBlock";
}) {
  const margin =
    spacing === "belowScore"
      ? "mt-7"
      : spacing === "afterBlock"
        ? "mt-8"
        : "mt-2.5";
  return (
    <div
      className={`${margin} self-stretch ${dividerLineClass}`}
      role="separator"
    />
  );
}

function GlassButton({
  children,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="min-h-[42px] min-w-[128px] flex-1 rounded-[3px] border border-white/[0.18] bg-gradient-to-b from-[#343b4a] via-[#1c212c] to-[#12151c] px-5 py-2 text-center text-[0.82rem] font-medium tracking-[0.1em] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.11),inset_0_-1px_0_rgba(0,0,0,0.35),0_6px_20px_rgba(0,0,0,0.45)] transition-[transform,box-shadow,border-color,background-color] hover:border-white/28 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_28px_rgba(0,0,0,0.5)] active:translate-y-px sm:min-w-[148px]"
    >
      {children}
    </button>
  );
}
