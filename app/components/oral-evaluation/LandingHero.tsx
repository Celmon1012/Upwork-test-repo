"use client";

import { LANDING } from "./content";

export function LandingHero({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="relative z-10 flex min-h-[min(100dvh,100%)] w-full flex-col items-center justify-center px-6 py-8 sm:px-10">
      <div className="w-full max-w-3xl text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-amber-200/85">
          {LANDING.eyebrow}
        </p>
        <h1 className="mt-6 max-w-[22rem] font-serif text-[1.85rem] font-medium leading-[1.12] tracking-[0.05em] text-white drop-shadow-[0_4px_40px_rgba(0,0,0,0.5)] sm:max-w-none sm:text-[2.25rem] md:text-[2.65rem]">
          {LANDING.headline}
        </h1>
        <p className="mx-auto mt-8 max-w-2xl text-[0.98rem] leading-[1.75] text-white/75 sm:text-[1.05rem]">
          {LANDING.lead}
        </p>

        <div className="mx-auto mt-12 grid max-w-2xl gap-5 text-left sm:grid-cols-3 sm:items-stretch sm:gap-5">
          {LANDING.steps.map((s) => (
            <article
              key={s.n}
              className="group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[linear-gradient(165deg,rgba(20,24,34,0.97)_0%,rgba(10,12,18,0.99)_48%,rgba(6,7,11,1)_100%)] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-amber-400/20 hover:shadow-[0_24px_56px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.09)] sm:min-h-[176px] sm:p-6"
            >
              <div
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/45 to-transparent sm:inset-x-6"
                aria-hidden
              />
              <div className="pointer-events-none absolute -right-2 -top-3 font-serif text-[4.25rem] font-extralight leading-none tabular-nums text-white/[0.25] transition-colors duration-300 group-hover:text-amber-200/[0.09]">
                {s.n}
              </div>
              <div className="relative z-10 flex min-h-0 flex-1 flex-col pt-1">
                <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/[0.95]">
                  {s.title}
                </h3>
                <p className="mt-3 flex-1 text-[0.8rem] leading-relaxed text-white/58">
                  {s.desc}
                </p>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={onBegin}
          className="mt-10 inline-flex min-h-[46px] min-w-[260px] items-center justify-center rounded-[1px] border border-amber-200/22 bg-gradient-to-b from-[#262320] to-[#0c0b0a] px-12 text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-amber-100/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.5),0_10px_36px_rgba(0,0,0,0.55)] transition-[transform,box-shadow,border-color] hover:border-amber-100/28 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_14px_44px_rgba(0,0,0,0.6)] active:translate-y-px"
        >
          {LANDING.cta}
        </button>
      </div>
    </div>
  );
}
