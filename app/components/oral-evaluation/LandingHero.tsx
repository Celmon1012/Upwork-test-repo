"use client";

import { LANDING } from "./content";

export function LandingHero({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="relative z-10 flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16 sm:px-10">
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

        <div className="mx-auto mt-14 grid max-w-2xl gap-8 text-left sm:grid-cols-3 sm:gap-6">
          {LANDING.steps.map((s) => (
            <div
              key={s.n}
              className="rounded-sm border border-white/10 bg-[rgba(8,10,18,0.45)] px-4 py-5 backdrop-blur-sm"
            >
              <p className="font-serif text-[1.35rem] font-medium text-white/35">
                {s.n}
              </p>
              <p className="mt-2 text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-white/90">
                {s.title}
              </p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-white/55">
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onBegin}
          className="mt-16 inline-flex min-h-[46px] min-w-[260px] items-center justify-center rounded-[1px] border border-amber-200/22 bg-gradient-to-b from-[#262320] to-[#0c0b0a] px-12 text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-amber-100/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.5),0_10px_36px_rgba(0,0,0,0.55)] transition-[transform,box-shadow,border-color] hover:border-amber-100/28 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_14px_44px_rgba(0,0,0,0.6)] active:translate-y-px"
        >
          {LANDING.cta}
        </button>
      </div>
    </div>
  );
}
