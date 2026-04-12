"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

const QUESTION =
  "You are planning a VFR cross-country flight from KFXE to KORL. How will you prepare for the trip?";

const FEEDBACK = {
  score: "2 – Adequate, but incomplete",
  covered: [
    "You mentioned checking weather and NOTAMs.",
    "You referenced using a sectional for route planning.",
  ],
  missed: [
    "You did not mention aircraft performance or weight and balance.",
    "You did not discuss alternates or fuel reserve planning in detail.",
  ],
  stronger:
    "Start with IM SAFE, then walk through weather, route, performance, fuel, alternates, and NOTAMs in order. Tie each item to how it affects your go/no-go decision.",
  why: "Preflight preparation reduces risk on cross-country flights by ensuring you identify hazards before you are airborne.",
};

/** Center-bright horizontal rule (shared by hero + feedback dividers). 2px min avoids “vanishing” 1px lines on some full-width / DPI combos. */
const dividerLineClass =
  "h-[2px] min-h-[2px] w-full shrink-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.12)_22%,rgba(255,255,255,0.38)_50%,rgba(255,255,255,0.12)_78%,transparent_100%)]";

export default function Home() {
  const [phase, setPhase] = useState<"input" | "feedback">("input");
  const [inputExiting, setInputExiting] = useState(false);
  const [panelEntering, setPanelEntering] = useState(false);

  const goToFeedback = useCallback(() => {
    setInputExiting(true);
    window.setTimeout(() => {
      setPhase("feedback");
    }, 520);
  }, []);

  useEffect(() => {
    if (phase !== "feedback") return;
    const id = window.requestAnimationFrame(() => {
      window.setTimeout(() => setPanelEntering(true), 40);
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Single full-screen cockpit background */}
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
          className="absolute inset-0 bg-black/35"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-14 sm:px-10 sm:py-16">
        {/* Input view */}
        {phase === "input" && (
        <div
          className={`flex w-full max-w-[min(100%,960px)] flex-col transition-[opacity,filter] duration-500 ease-out ${
            inputExiting
              ? "pointer-events-none opacity-0 blur-[1px]"
              : "opacity-100"
          }`}
        >
          <h1 className="text-center font-serif text-[clamp(1.75rem,4vw,3.35rem)] font-medium tracking-[0.38em] text-white">
            ORAL EVALUATION
          </h1>
          {/* Full width: avoid items-center so the rule is not width-collapsed at large viewports */}
          <div
            className={`mt-3 w-full ${dividerLineClass}`}
            role="separator"
            aria-hidden
          />
          <h2 className="mt-5 text-center text-[1.85rem] font-medium tracking-wide text-white sm:text-[2rem]">
            Preflight Preparation
          </h2>

          <p className="mt-12 w-full max-w-none text-center text-[1.125rem] leading-[1.7] text-white sm:text-[1.2rem]">
            {QUESTION}
          </p>

          <div className="mt-10 w-full">
            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <textarea
              id="answer"
              rows={7}
              placeholder=""
              className="box-border min-h-[188px] w-full resize-y rounded-sm border border-white/20 bg-[rgba(22,28,42,0.55)] px-5 py-4 text-[0.95rem] leading-relaxed text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-md placeholder:text-white/35 focus:border-white/35 focus:ring-1 focus:ring-white/15"
            />
            <div className="mt-3 flex justify-center" aria-hidden>
              <svg
                width="18"
                height="10"
                viewBox="0 0 18 10"
                className="text-white/90"
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

          <div className="mt-10 flex w-full flex-wrap items-stretch justify-center gap-4 sm:flex-nowrap sm:gap-5">
            <GlassButton type="button" onClick={goToFeedback}>
              Submit
            </GlassButton>
            <GlassButton type="button">Skip</GlassButton>
            <GlassButton type="button">Mark for Review</GlassButton>
          </div>
        </div>
        )}

        {/* Feedback panel */}
        {phase === "feedback" && (
          <div
            className={`feedback-panel w-full max-w-[min(100%,960px)] rounded-sm border border-white/18 bg-[rgba(20,25,35,0.82)] px-7 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-[14px] transition-[opacity,transform] duration-700 ease-out sm:px-10 sm:py-10 ${
              panelEntering
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
            role="dialog"
            aria-labelledby="feedback-score"
            aria-modal="true"
          >
            <p
              id="feedback-score"
              className="text-center text-[1.55rem] font-semibold leading-snug text-[#E5A959] sm:text-[2.4rem]"
            >
              {FEEDBACK.score}
            </p>

            <Divider spacing="belowScore" />

            <SectionTitle className="mt-8">What You Covered</SectionTitle>
            <Divider spacing="belowTitle" />
            <ul className="mt-6 space-y-2.5 text-[1rem] leading-relaxed text-white/95 sm:text-[1.0625rem]">
              {FEEDBACK.covered.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0 text-[#4CAF50]" aria-hidden>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Divider spacing="afterBlock" />

            <SectionTitle className="mt-8">What You Missed</SectionTitle>
            <Divider spacing="belowTitle" />
            <ul className="mt-6 space-y-2.5 text-[1rem] leading-relaxed text-white/95 sm:text-[1.0625rem]">
              {FEEDBACK.missed.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0 text-[#F44336]" aria-hidden>
                    ✕
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Divider spacing="afterBlock" />

            <SectionTitle className="mt-8">Stronger Answer</SectionTitle>
            <Divider spacing="belowTitle" />
            <p className="mt-6 text-[1rem] leading-relaxed text-white/95 sm:text-[1.0625rem]">
              {FEEDBACK.stronger}
            </p>

            <Divider spacing="afterBlock" />

            <SectionTitle className="mt-8">Why This Matters</SectionTitle>
            <Divider spacing="belowTitle" />
            <p className="mt-6 text-[1rem] leading-relaxed text-white/95 sm:text-[1.0625rem]">
              {FEEDBACK.why}
            </p>

            <div className="mt-10 flex w-full flex-wrap items-stretch justify-center gap-4 sm:flex-nowrap sm:gap-5">
              <GlassButton
                type="button"
                onClick={() => {
                  setPhase("input");
                  setInputExiting(false);
                  setPanelEntering(false);
                }}
              >
                Continue
              </GlassButton>
              <GlassButton type="button">Review Later</GlassButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-left text-[0.95rem] font-bold tracking-wide text-white ${className}`}
    >
      {children}
    </h2>
  );
}

/** Full-width 1px rule with soft glow at center. */
function Divider({
  spacing = "belowTitle",
}: {
  spacing?: "belowScore" | "belowTitle" | "afterBlock";
}) {
  const margin =
    spacing === "belowScore"
      ? "mt-6"
      : spacing === "afterBlock"
        ? "mt-8"
        : "mt-2";
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
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="min-h-[44px] min-w-[140px] flex-1 rounded-sm border border-white/22 bg-gradient-to-b from-[#2a2f3a] to-[#151820] px-6 py-2.5 text-center text-[0.92rem] font-medium tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,border-color] hover:border-white/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_16px_rgba(0,0,0,0.4)] active:translate-y-px sm:min-w-[158px]"
    >
      {children}
    </button>
  );
}
