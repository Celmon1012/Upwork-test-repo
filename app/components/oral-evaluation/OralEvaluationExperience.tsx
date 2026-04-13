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
  EVALUATION,
  EVALUATING_MS,
  SESSION,
  type ScoreValue,
} from "./content";
import { LandingHero } from "./LandingHero";

const dividerLineClass =
  "h-[2px] min-h-[2px] w-full shrink-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.12)_22%,rgba(255,255,255,0.38)_50%,rgba(255,255,255,0.12)_78%,transparent_100%)]";

const scoreAccent = {
  0: {
    numeral: "#d48a8a",
    ring: "shadow-[0_0_36px_rgba(244,67,54,0.22)]",
    bar: "from-rose-400/90 to-orange-300/80",
  },
  1: {
    numeral: "#c9a050",
    ring: "shadow-[0_0_36px_rgba(245,158,11,0.22)]",
    bar: "from-amber-400/90 to-yellow-300/75",
  },
  2: {
    numeral: "#c8922a",
    ring: "shadow-[0_0_40px_rgba(200,146,42,0.28)]",
    bar: "from-[#c8922a]/80 to-[#a67a20]/90",
  },
  3: {
    numeral: "#7dcca0",
    ring: "shadow-[0_0_36px_rgba(74,222,128,0.22)]",
    bar: "from-emerald-400/95 to-teal-400/85",
  },
} as const;

const scoreBands: ReadonlyArray<{
  value: ScoreValue;
  label: string;
}> = [
  { value: 0, label: "Unsafe / unacceptable" },
  { value: 1, label: "Partial / below standard" },
  { value: 2, label: "Adequate / incomplete" },
  { value: 3, label: "Complete / checkride ready" },
] as const;

type Flow = "landing" | "session";
type SessionPhase = "respond" | "evaluating" | "feedback";

export function OralEvaluationExperience() {
  const [flow, setFlow] = useState<Flow>("landing");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [panelEntering, setPanelEntering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();

  const beginSession = useCallback(() => {
    setFlow("session");
    setSessionPhase("respond");
  }, []);

  const runEvaluation = useCallback(() => {
    const answer = answerRef.current?.value.trim() ?? "";
    if (!answer) {
      setAnswerError("Please enter your response before submitting.");
      answerRef.current?.focus();
      return;
    }
    setAnswerError(null);
    setSessionPhase("evaluating");
    window.setTimeout(() => {
      setSessionPhase("feedback");
    }, EVALUATING_MS);
  }, []);

  useEffect(() => {
    if (sessionPhase !== "feedback") return;
    setPanelEntering(false);
    const id = window.requestAnimationFrame(() => {
      window.setTimeout(() => setPanelEntering(true), 60);
    });
    return () => cancelAnimationFrame(id);
  }, [sessionPhase]);

  const backToRespond = useCallback(() => {
    setSessionPhase("respond");
    setPanelEntering(false);
    setAnswerError(null);
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  const backToLanding = useCallback(() => {
    setFlow("landing");
    setSessionPhase("respond");
    setPanelEntering(false);
    setAnswerError(null);
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showRespondLayer =
    flow === "session" &&
    (sessionPhase === "respond" || sessionPhase === "evaluating");

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[#05070c]">
      <BackgroundStack intensify={evaluating} />

      {flow === "landing" && (
        <div className="relative z-10 flex min-h-full w-full flex-1 flex-col justify-center overflow-y-auto oral-scrollbar-none">
          <LandingHero onBegin={beginSession} />
        </div>
      )}

      {flow === "session" && (
        <div className="oral-eval-scale relative flex w-full min-h-0 flex-col overflow-hidden">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden oral-scrollbar-none px-5 py-5 sm:px-8 sm:py-6">
            {showRespondLayer && (
              <div
                className={`flex w-full max-w-[min(100%,720px)] flex-col transition-[opacity,filter] duration-700 ease-out ${
                  evaluating
                    ? "pointer-events-none opacity-[0.28] blur-[1px]"
                    : "opacity-100"
                }`}
                aria-hidden={evaluating}
              >
                <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-white/50">
                  Oral examination · {SESSION.contextLabel}
                </p>
                <p className="mt-10 text-center font-serif text-[1.05rem] font-medium italic leading-snug text-white/90 sm:text-[1.15rem]">
                  {SESSION.promptLine}
                </p>
                <p className="mx-auto mt-6 max-w-[40rem] text-center text-[0.98rem] font-light leading-[1.75] text-white/88 sm:text-[1.02rem]">
                  {SESSION.scenario}
                </p>

                <div className="mx-auto mt-10 w-full max-w-xl">
                  <label htmlFor="oral-answer" className="sr-only">
                    Your response
                  </label>
                  <textarea
                    ref={answerRef}
                    id="oral-answer"
                    rows={3}
                    placeholder="Speak as you would to the examiner…"
                    aria-invalid={Boolean(answerError)}
                    aria-describedby={answerError ? "oral-answer-error" : undefined}
                    onChange={() => {
                      if (answerError) setAnswerError(null);
                    }}
                    className={`oral-input box-border min-h-[8.5rem] max-h-[min(42vh,18rem)] w-full resize-none rounded-none border-0 border-b bg-[rgba(6,9,16,0.65)] px-3 py-3 text-[0.88rem] leading-[1.55] text-white outline-none backdrop-blur-[2px] placeholder:text-white/28 focus:border-b-amber-400/50 focus:ring-0 sm:min-h-[9rem] sm:text-[0.9rem] ${
                      answerError ? "border-b-rose-400/70" : "border-white/22"
                    }`}
                  />
                  {answerError && (
                    <p
                      id="oral-answer-error"
                      className="mt-2 text-[0.74rem] text-rose-300/90"
                      role="alert"
                    >
                      {answerError}
                    </p>
                  )}
                </div>

                <div className="mx-auto mt-10 w-full max-w-xs">
                  <PrimaryButton type="button" onClick={runEvaluation}>
                    Submit response
                  </PrimaryButton>
                </div>
              </div>
            )}

            {evaluating && (
              <div
                className="evaluating-overlay pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[3px]"
                role="status"
                aria-live="polite"
              >
                <p className="evaluating-text font-serif text-[1.15rem] font-medium tracking-[0.28em] text-white/95 sm:text-[1.25rem]">
                  Evaluating response…
                </p>
                <p className="mt-4 max-w-xs text-center text-[0.75rem] font-normal tracking-wide text-white/40">
                  One moment.
                </p>
              </div>
            )}

            {sessionPhase === "feedback" && (
              <div
                className="oral-glass-panel feedback-outcome relative z-20 my-auto w-full max-w-[min(100%,880px)] shrink-0 overflow-visible"
                role="dialog"
                aria-labelledby={dialogLabelId}
                aria-modal="true"
              >
                <div
                  className={`px-6 pt-12 pb-14 sm:px-10 sm:pt-14 sm:pb-16 motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    panelEntering
                      ? "translate-y-0 opacity-100"
                      : "translate-y-3 opacity-0"
                  }`}
                >
                  <JudgmentBlock
                    id={dialogLabelId}
                    value={EVALUATION.score}
                    outcomeLabel={EVALUATION.outcomeLabel}
                    judgment={EVALUATION.judgment}
                    examinerNote={EVALUATION.examinerNote}
                  />

                  <Divider spacing="belowScore" />

                  <SectionTitle>What was correct</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-2 space-y-2 text-[0.88rem] leading-snug text-white/[0.92] sm:text-[0.9rem]">
                    {EVALUATION.correct.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-emerald-400/90"
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Divider spacing="afterBlock" />

                  <SectionTitle>What was missed</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-2 space-y-2 text-[0.88rem] leading-snug text-white/[0.92] sm:text-[0.9rem]">
                    {EVALUATION.missed.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-rose-400/90"
                          aria-hidden
                        >
                          ✕
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Divider spacing="afterBlock" />

                  <SectionTitle>Stronger answer</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-2 text-[0.88rem] leading-snug text-white/[0.92] sm:text-[0.9rem]">
                    {EVALUATION.stronger}
                  </p>

                  <Divider spacing="afterBlock" />

                  <SectionTitle>Why it matters</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-2 text-[0.88rem] leading-snug text-white/[0.92] sm:text-[0.9rem]">
                    {EVALUATION.why}
                  </p>

                  <div className="mt-12 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
                    <PrimaryButton
                      type="button"
                      variant="feedbackContinue"
                      className="max-w-md sm:min-w-[200px]"
                      onClick={backToRespond}
                    >
                      Continue
                    </PrimaryButton>
                    <PrimaryButton
                      type="button"
                      variant="feedbackReview"
                      className="max-w-md sm:min-w-[200px]"
                      onClick={backToLanding}
                    >
                      Review Later
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BackgroundStack({ intensify }: { intensify: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <Image
        src="/cockpit-bg.png"
        alt=""
        fill
        priority
        unoptimized
        className={`object-cover object-center transition-all duration-1000 ${
          intensify ? "scale-[1.03] brightness-[0.45]" : "brightness-[0.55]"
        }`}
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b from-[#0c1828]/40 via-transparent transition-opacity duration-1000 ${
          intensify ? "to-[#020308]/92 opacity-100" : "to-[#04060a]/65 opacity-100"
        }`}
        aria-hidden
      />
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          intensify ? "opacity-90" : "opacity-100"
        } bg-[radial-gradient(ellipse_95%_70%_at_50%_42%,transparent_25%,rgba(0,0,0,0.55)_100%)]`}
        aria-hidden
      />
      {intensify && (
        <div
          className="absolute inset-0 bg-amber-950/10 mix-blend-overlay transition-opacity duration-1000"
          aria-hidden
        />
      )}
      <div
        className="oral-grain absolute inset-0 opacity-[0.04]"
        aria-hidden
      />
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
  const accent = scoreAccent[value];
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-white/40">
        Outcome · {outcomeLabel}
      </p>
      <h2
        id={id}
        className="mt-3 max-w-[24rem] font-serif text-[1.6rem] font-semibold leading-tight tracking-wide text-[#f0d9a8] drop-shadow-[0_0_28px_rgba(229,169,89,0.22)] sm:max-w-2xl sm:text-[1.9rem] md:text-[2.05rem]"
      >
        {judgment}
      </h2>
      <div
        className={`relative mt-3 flex h-[4rem] w-[4rem] shrink-0 items-center justify-center rounded-full border border-white/12 bg-gradient-to-b from-white/[0.08] to-white/[0.02] ${accent.ring}`}
      >
        <span
          className="text-[3.15rem] font-light tabular-nums leading-none tracking-tight sm:text-[3.2rem]"
          style={{
            fontFamily: "var(--font-cormorant), var(--font-cinzel), ui-serif, serif",
            color: accent.numeral,
          }}
        >
          {value}
        </span>
        <div
          className={`absolute -bottom-0.5 left-1/2 h-0.5 w-[38%] -translate-x-1/2 rounded-full bg-gradient-to-r ${accent.bar}`}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[0.62rem] uppercase tracking-[0.2em] text-white/32">
        Oral score (0–3)
      </p>
      <div className="mt-3 grid w-full max-w-[40rem] grid-cols-2 gap-2 text-left sm:grid-cols-4">
        {scoreBands.map((band) => {
          const active = band.value === value;
          return (
            <div
              key={band.value}
              className={`rounded-[2px] border px-2.5 py-2 text-[0.62rem] uppercase tracking-[0.08em] transition-colors ${
                active
                  ? "border-amber-300/45 bg-amber-200/[0.08] text-amber-100/95"
                  : "border-white/10 bg-black/20 text-white/38"
              }`}
            >
              <span className="font-semibold text-[0.68rem]">{band.value}</span>{" "}
              {band.label}
            </div>
          );
        })}
      </div>
      <p className="mx-auto mt-3 max-w-[min(42rem,92%)] text-[0.8rem] font-normal italic leading-relaxed text-white/52">
        {examinerNote}
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
      className={`pt-[1.85rem] text-left text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-white/82 ${className}`}
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
      ? "mt-6"
      : spacing === "afterBlock"
        ? "mt-5"
        : "mt-3";
  return (
    <div
      className={`${margin} self-stretch ${dividerLineClass}`}
      role="separator"
    />
  );
}

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "feedbackContinue"
  | "feedbackReview";

function PrimaryButton({
  children,
  type = "button",
  onClick,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
}) {
  const base =
    "inline-flex min-h-[48px] w-full items-center justify-center rounded-[2px] px-6 text-center text-[0.8rem] font-semibold uppercase tracking-[0.18em] transition-[transform,box-shadow,border-color,background-color,color] active:translate-y-px";
  const styles: Record<ButtonVariant, string> = {
    primary:
      "border border-amber-400/40 bg-gradient-to-b from-[#3d3830] to-[#1c1812] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_28px_rgba(0,0,0,0.45)] hover:border-amber-300/55 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)]",
    secondary:
      "border border-white/20 bg-gradient-to-b from-[#343b4a] to-[#12151c] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_20px_rgba(0,0,0,0.4)] hover:border-white/30",
    ghost:
      "border border-white/12 bg-transparent text-white/75 hover:border-white/25 hover:text-white",
    feedbackContinue:
      "border border-[rgba(200,165,60,0.35)] bg-[rgba(200,165,60,0.08)] text-[rgba(220,195,140,0.9)] hover:border-[rgba(200,165,60,0.5)] hover:bg-[rgba(200,165,60,0.12)]",
    feedbackReview:
      "border border-[rgba(255,255,255,0.08)] bg-transparent text-[rgba(180,165,135,0.45)] hover:border-[rgba(255,255,255,0.14)] hover:text-[rgba(180,165,135,0.6)]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
