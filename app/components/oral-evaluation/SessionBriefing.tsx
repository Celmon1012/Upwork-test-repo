"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { SessionMode } from "@/app/components/oral-evaluation/SessionFrame";

const cinematicEase = [0.16, 1, 0.3, 1] as const;

const HEADLINE: Record<SessionMode, string> = {
  exam: "Practice oral exam",
  bookmarks: "Reviewing bookmarked questions",
  resume: "Resuming where you left off",
};

const SUBHEAD: Record<SessionMode, string> = {
  exam: "An ACS-style oral session — answer in your own words. The examiner will respond, judge, and move on.",
  bookmarks:
    "The questions you marked Review later. Same examiner, same judgment, just your saved set.",
  resume:
    "Picking up your last session — your draft, position, and bookmarks are restored.",
};

/**
 * Pre-session briefing. A brief, atmospheric orientation moment before the
 * evaluator screen takes over — gives the user structure (mode, count,
 * what to expect) without breaking the cinematic feel.
 */
export function SessionBriefing({
  mode,
  total,
  startIndex,
  onBegin,
}: {
  mode: SessionMode;
  total: number;
  startIndex: number;
  onBegin: () => void;
}) {
  const reduce = useReducedMotion();
  const isResume = mode === "resume";
  const headline = HEADLINE[mode];
  const subhead = SUBHEAD[mode];
  const remaining = Math.max(total - startIndex, 0);
  const positionLine = isResume
    ? `Question ${Math.min(startIndex + 1, total)} of ${total} — ${remaining === 0 ? "wrap-up ahead" : `${remaining} ${remaining === 1 ? "scenario" : "scenarios"} remaining`}.`
    : `${total} ${total === 1 ? "scenario" : "scenarios"} ahead.`;

  return (
    <motion.div
      role="dialog"
      aria-labelledby="oral-briefing-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(ellipse_120%_80%_at_50%_30%,rgba(30,58,95,0.28)_0%,transparent_60%),linear-gradient(180deg,#04060c_0%,#02040a_100%)] px-6 py-10"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.55, ease: cinematicEase }}
    >
      <div className="mx-auto flex max-w-[min(92vw,640px)] flex-col items-start text-left">
        <motion.span
          aria-hidden
          className="mb-7 flex w-fit items-center justify-center gap-3 sm:mb-9 sm:gap-3.5"
          initial={reduce ? false : { opacity: 0, scaleX: 0.7 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.15, ease: cinematicEase }}
        >
          <span className="block h-[1px] w-10 bg-gradient-to-r from-amber-200/0 to-amber-200/45 sm:w-14" />
          <span className="block size-[3.5px] rounded-full bg-amber-200/80 [box-shadow:0_0_14px_rgba(255,219,158,0.85),0_0_4px_rgba(255,219,158,1)]" />
          <span className="block h-[1px] w-10 bg-gradient-to-l from-amber-200/0 to-amber-200/45 sm:w-14" />
        </motion.span>

        <motion.p
          className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-amber-100/75"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.25, ease: cinematicEase }}
        >
          Checkride AI
        </motion.p>

        <motion.h2
          id="oral-briefing-title"
          className="mt-3 max-w-[28rem] font-serif text-[1.65rem] font-medium leading-[1.18] tracking-[-0.015em] text-white [text-shadow:0_2px_40px_rgba(0,0,0,0.55)] [text-wrap:balance] sm:text-[2.1rem]"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.32, ease: cinematicEase }}
        >
          {headline}
        </motion.h2>

        <motion.p
          className="mt-5 max-w-[34rem] font-serif text-[1rem] font-light italic leading-[1.6] tracking-[0.005em] text-white/[0.78] [text-wrap:pretty] sm:text-[1.06rem]"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.42, ease: cinematicEase }}
        >
          {subhead}
        </motion.p>

        <motion.p
          className="mt-7 font-sans text-[0.78rem] font-medium uppercase tracking-[0.22em] text-white/55 tabular-nums"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.56, ease: cinematicEase }}
        >
          {positionLine}
        </motion.p>

        <motion.ul
          className="mt-7 space-y-3 font-sans text-[0.86rem] leading-relaxed text-white/55 sm:text-[0.92rem]"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.68, ease: cinematicEase }}
        >
          <li className="flex items-start gap-3">
            <span className="mt-2 inline-block size-[3px] shrink-0 rounded-full bg-amber-200/55" aria-hidden />
            <span>Answer in your own words — clarity and structure matter, not perfect phrasing.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-2 inline-block size-[3px] shrink-0 rounded-full bg-amber-200/55" aria-hidden />
            <span>The examiner judges, debriefs, and offers the next move. You choose how to continue.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-2 inline-block size-[3px] shrink-0 rounded-full bg-amber-200/55" aria-hidden />
            <span>Bookmark with Review later. Progress saves automatically — leave and return any time.</span>
          </li>
        </motion.ul>

        <motion.div
          className="mt-10 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.65, delay: reduce ? 0 : 0.82, ease: cinematicEase }}
        >
          <button
            type="button"
            onClick={onBegin}
            autoFocus
            className="group inline-flex items-center justify-center gap-3 rounded-sm border-0 bg-transparent px-2 py-3 font-sans text-[13px] font-bold uppercase leading-none tracking-[0.32em] text-amber-50 outline-none transition-[color,letter-spacing,text-shadow] duration-300 ease-out hover:tracking-[0.38em] focus-visible:ring-1 focus-visible:ring-amber-200/45 active:translate-y-px [text-shadow:0_0_30px_rgba(255,219,158,0.42),0_1px_2px_rgba(0,0,0,0.7)] hover:[text-shadow:0_0_46px_rgba(255,219,158,0.68),0_1px_2px_rgba(0,0,0,0.7)] sm:text-[13.5px] sm:tracking-[0.34em]"
          >
            <span>{isResume ? "Resume session" : "Begin"}</span>
            <ArrowRight
              className="size-[16px] shrink-0 opacity-100 transition-transform duration-300 ease-out group-hover:translate-x-[2px]"
              strokeWidth={2}
              aria-hidden
            />
          </button>
          <p className="font-serif text-[0.84rem] font-light italic text-white/40 sm:text-[0.88rem]">
            Take a breath. The examiner is ready when you are.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
