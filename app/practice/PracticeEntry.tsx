import Link from "next/link";
import type { PracticeEntryState } from "@/lib/oral/practiceEntryState";

export function PracticeEntry({
  email,
  entry,
}: {
  email: string;
  entry: PracticeEntryState;
}) {
  const {
    questionCount,
    bookmarkCount,
    canContinue,
    catalogError,
    hasCatalog,
  } = entry;

  const shell =
    "rounded-2xl border border-white/[0.1] bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-7";

  const btnPrimary =
    "inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl border border-white/75 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 disabled:pointer-events-none disabled:opacity-45";

  const btnSecondary =
    "inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-center text-sm font-medium text-white/92 transition hover:border-white/35 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40";

  const btnGhost =
    "inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-center text-sm font-medium text-white/75 transition hover:border-amber-200/35 hover:bg-amber-400/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/30 disabled:pointer-events-none disabled:opacity-35";

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(255,200,140,0.08)_0%,transparent_55%),linear-gradient(180deg,#070a12_0%,#04060c_100%)] px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-lg">
        <p className="text-[0.65rem] uppercase tracking-[0.28em] text-white/45">
          Signed in
        </p>
        <p className="mt-2 truncate font-mono text-[0.8rem] text-white/55">
          {email}
        </p>

        <h1 className="mt-10 font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.02em] text-white [text-shadow:0_2px_40px_rgba(0,0,0,0.45)] sm:text-[2.1rem]">
          Oral exam practice
        </h1>
        <p className="mt-4 max-w-[26rem] font-serif text-[0.98rem] font-light italic leading-relaxed text-white/[0.72]">
          ACS-style oral scenarios in a focused examiner session. Choose how you want
          to train — progress is saved automatically.
        </p>

        {catalogError ? (
          <p
            className="mt-6 rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-4 py-3 font-sans text-[0.82rem] leading-relaxed text-amber-100/90"
            role="status"
          >
            {catalogError}
          </p>
        ) : null}

        <div className={`mt-10 ${shell}`}>
          <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/40">
            Session
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {canContinue && hasCatalog ? (
              <Link href="/practice/session" className={btnPrimary}>
                Continue previous session
              </Link>
            ) : (
              <button type="button" disabled className={btnPrimary}>
                Continue previous session
                <span className="sr-only"> — unavailable</span>
              </button>
            )}
            {!(canContinue && hasCatalog) ? (
              <p className="font-sans text-[0.78rem] leading-relaxed text-white/42">
                {hasCatalog
                  ? "No in-progress session yet. Start a new oral exam below."
                  : "Load a question catalog to enable sessions."}
              </p>
            ) : null}

            {hasCatalog ? (
              <Link href="/practice/session?reset=1" className={btnSecondary}>
                Start new oral exam
              </Link>
            ) : (
              <button type="button" disabled className={btnSecondary}>
                Start new oral exam
              </button>
            )}
            <p className="font-sans text-[0.72rem] leading-relaxed text-white/38">
              Begins a fresh run through the question deck and clears saved progress
              for this catalog (bookmarks included).
            </p>
          </div>
        </div>

        <div className={`mt-6 ${shell}`}>
          <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/40">
            Review
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {bookmarkCount > 0 && hasCatalog ? (
              <Link href="/practice/session?mode=bookmarks" className={btnSecondary}>
                Review bookmarked questions
                <span className="ml-2 font-sans text-[0.72rem] font-normal text-white/50">
                  ({bookmarkCount})
                </span>
              </Link>
            ) : (
              <button type="button" disabled className={btnGhost}>
                Review bookmarked questions ({bookmarkCount})
              </button>
            )}
            <p className="font-sans text-[0.72rem] leading-relaxed text-white/38">
              Questions you marked &ldquo;Review later&rdquo; in the evaluator.
            </p>
          </div>
        </div>

        <div className={`mt-6 ${shell}`}>
          <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/40">
            Coming soon
          </p>
          <ul className="mt-4 space-y-3 font-sans text-[0.85rem] leading-relaxed text-white/48">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/25" />
              <span>
                <span className="text-white/65">Practice weak areas</span> — uses
                your scores to prioritize topics (needs analytics layer).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/25" />
              <span>
                <span className="text-white/65">Study by ACS category</span> — browse
                by ACS code once categories are tagged on questions.
              </span>
            </li>
          </ul>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 border-t border-white/[0.08] pt-8">
          <p className="font-sans text-center text-[0.72rem] text-white/38">
            {hasCatalog ? (
              <>
                <span className="text-white/55">{questionCount}</span> scenario
                {questionCount === 1 ? "" : "s"} in your current deck.
              </>
            ) : (
              <>No scenarios loaded — fix catalog configuration to begin.</>
            )}
          </p>
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-white/38 transition hover:bg-white/[0.05] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <span
              className="inline-block translate-x-0 transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden
            >
              ←
            </span>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
