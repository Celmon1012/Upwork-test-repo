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

type Flow = "landing" | "session";
type SessionPhase = "respond" | "evaluating" | "feedback";

export function OralEvaluationExperience() {
  const [flow, setFlow] = useState<Flow>("landing");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [panelEntering, setPanelEntering] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const dialogLabelId = useId();

  const beginSession = useCallback(() => {
    setFlow("session");
    setSessionPhase("respond");
  }, []);

  const runEvaluation = useCallback(() => {
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
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  const backToLanding = useCallback(() => {
    setFlow("landing");
    setSessionPhase("respond");
    setPanelEntering(false);
    if (answerRef.current) answerRef.current.value = "";
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showRespondLayer =
    flow === "session" &&
    (sessionPhase === "respond" || sessionPhase === "evaluating");

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05070c]">
      <BackgroundStack intensify={evaluating} />

      {flow === "landing" && <LandingHero onBegin={beginSession} />}

      {flow === "session" && (
        <div className="oral-eval-scale relative w-full min-h-[125vh]">
          <div className="relative z-10 flex min-h-[125vh] flex-col items-center justify-center px-6 py-10 sm:px-10 sm:py-12">
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
                    className="oral-input box-border min-h-[4.25rem] max-h-[min(36vh,12rem)] w-full resize-y rounded-sm border border-white/18 bg-[rgba(18,22,34,0.72)] px-3.5 py-2.5 text-[0.9rem] leading-[1.55] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-md placeholder:text-white/28 focus:border-amber-400/25 focus:ring-1 focus:ring-amber-400/15 sm:min-h-[4.5rem] sm:px-4 sm:py-3 sm:text-[0.93rem]"
                  />
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
                className="oral-glass-panel feedback-outcome relative z-20 w-full max-w-[min(100%,800px)] origin-top scale-90"
                role="dialog"
                aria-labelledby={dialogLabelId}
                aria-modal="true"
              >
                <div
                  className={`px-6 py-10 sm:px-10 sm:py-11 motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
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

                  <SectionTitle className="mt-9">What was correct</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9rem] leading-relaxed text-white/[0.92] sm:text-[0.95rem]">
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

                  <SectionTitle className="mt-8">What was missed</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <ul className="mt-5 space-y-2.5 text-[0.9rem] leading-relaxed text-white/[0.92] sm:text-[0.95rem]">
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

                  <SectionTitle className="mt-8">Stronger answer</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9rem] leading-relaxed text-white/[0.92] sm:text-[0.95rem]">
                    {EVALUATION.stronger}
                  </p>

                  <Divider spacing="afterBlock" />

                  <SectionTitle className="mt-8">Why it matters</SectionTitle>
                  <Divider spacing="belowTitle" />
                  <p className="mt-5 text-[0.9rem] leading-relaxed text-white/[0.92] sm:text-[0.95rem]">
                    {EVALUATION.why}
                  </p>

                  <div className="mt-14 flex w-full flex-col items-stretch justify-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
                    <PrimaryButton
                      type="button"
                      variant="secondary"
                      className="max-w-md sm:min-w-[200px]"
                      onClick={backToRespond}
                    >
                      Continue
                    </PrimaryButton>
                    <PrimaryButton
                      type="button"
                      variant="ghost"
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
        className="mt-5 max-w-[22rem] font-serif text-[1.65rem] font-semibold leading-tight tracking-wide text-[#f0d9a8] drop-shadow-[0_0_32px_rgba(229,169,89,0.25)] sm:max-w-xl sm:text-[1.95rem] md:text-[2.15rem]"
      >
        {judgment}
      </h2>
      <p className="mx-auto mt-5 max-w-[34rem] text-[0.92rem] font-normal italic leading-relaxed text-white/70 sm:text-[0.98rem]">
        {examinerNote}
      </p>
      <div
        className={`relative mt-8 flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full border border-white/12 bg-gradient-to-b from-white/[0.1] to-white/[0.02] ${accent.ring}`}
      >
        <span
          className={`font-serif text-[1.85rem] font-semibold tabular-nums leading-none ${accent.glow}`}
        >
          {value}
        </span>
        <div
          className={`absolute -bottom-0.5 left-1/2 h-0.5 w-[38%] -translate-x-1/2 rounded-full bg-gradient-to-r ${accent.bar}`}
          aria-hidden
        />
      </div>
      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/35">
        Oral score (0–3)
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
      className={`text-left text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-white/88 ${className}`}
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
      ? "mt-9"
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
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex min-h-[48px] w-full items-center justify-center rounded-[2px] px-6 text-center text-[0.8rem] font-semibold uppercase tracking-[0.18em] transition-[transform,box-shadow,border-color] active:translate-y-px";
  const styles = {
    primary:
      "border border-amber-400/40 bg-gradient-to-b from-[#3d3830] to-[#1c1812] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_28px_rgba(0,0,0,0.45)] hover:border-amber-300/55 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)]",
    secondary:
      "border border-white/20 bg-gradient-to-b from-[#343b4a] to-[#12151c] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_20px_rgba(0,0,0,0.4)] hover:border-white/30",
    ghost:
      "border border-white/12 bg-transparent text-white/75 hover:border-white/25 hover:text-white",
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
