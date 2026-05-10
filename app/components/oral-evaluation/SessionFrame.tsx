"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

export type SessionMode = "exam" | "bookmarks" | "resume";

const cinematicEase = [0.16, 1, 0.3, 1] as const;

const MODE_LABELS: Record<SessionMode, string> = {
  exam: "Practice oral exam",
  bookmarks: "Bookmarks review",
  resume: "Resuming session",
};

/**
 * Top-of-viewport session frame: mode label + question position.
 * Hidden during the judgment beat so the examiner moment stays dominant.
 *
 * Stays visually minimal so the cinematic evaluator atmosphere is preserved.
 */
export function SessionFrame({
  mode,
  currentIndex,
  total,
  hideForJudgment,
  onExit,
}: {
  mode: SessionMode;
  currentIndex: number;
  total: number;
  hideForJudgment: boolean;
  onExit?: () => void;
}) {
  const reduce = useReducedMotion();
  const safeTotal = Math.max(total, 1);
  const safeIndex = Math.max(0, Math.min(currentIndex, safeTotal - 1));
  const progressPct = ((safeIndex + 1) / safeTotal) * 100;

  return (
    <motion.div
      aria-hidden={hideForJudgment ? "true" : "false"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex justify-center px-4 pt-3 sm:px-8 sm:pt-4"
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{
        opacity: hideForJudgment ? 0 : 1,
        y: 0,
      }}
      transition={{
        duration: reduce ? 0 : 0.55,
        ease: cinematicEase,
      }}
    >
      <div className="pointer-events-auto flex w-full max-w-[min(96vw,960px)] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-sans text-[0.66rem] font-medium uppercase tracking-[0.16em] text-white/40 transition hover:text-white/85 focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              aria-label="Exit to practice home"
            >
              <span
                className="inline-block translate-x-0 transition-transform duration-200 group-hover:-translate-x-0.5"
                aria-hidden
              >
                ←
              </span>
              <span className="hidden sm:inline">Practice home</span>
              <span className="sm:hidden">Exit</span>
            </button>
          ) : (
            <Link
              href="/practice"
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-sans text-[0.66rem] font-medium uppercase tracking-[0.16em] text-white/40 transition hover:text-white/85 focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            >
              <span
                className="inline-block translate-x-0 transition-transform duration-200 group-hover:-translate-x-0.5"
                aria-hidden
              >
                ←
              </span>
              <span className="hidden sm:inline">Practice home</span>
              <span className="sm:hidden">Exit</span>
            </Link>
          )}
          <span className="hidden h-3.5 w-px shrink-0 bg-white/15 sm:block" aria-hidden />
          <p className="hidden min-w-0 truncate font-sans text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-amber-100/65 sm:block">
            {MODE_LABELS[mode]}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <p
            className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-white/55 tabular-nums"
            aria-live="polite"
          >
            <span className="text-white/85">
              {String(safeIndex + 1).padStart(2, "0")}
            </span>
            <span className="mx-1 text-white/30">/</span>
            <span className="text-white/45">
              {String(safeTotal).padStart(2, "0")}
            </span>
          </p>
          <div
            className="hidden h-[2px] w-32 overflow-hidden rounded-full bg-white/[0.07] sm:block"
            role="progressbar"
            aria-valuenow={safeIndex + 1}
            aria-valuemin={1}
            aria-valuemax={safeTotal}
            aria-label="Session progress"
          >
            <motion.span
              className="block h-full bg-gradient-to-r from-amber-200/55 via-amber-200/80 to-amber-100/95 [box-shadow:0_0_10px_rgba(255,219,158,0.35)]"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{
                duration: reduce ? 0 : 0.7,
                ease: cinematicEase,
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
