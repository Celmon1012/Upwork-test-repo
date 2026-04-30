"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export function LandingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  if (user === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0a1018] font-sans text-white/45">
        …
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a1018] px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/48">
        Checkride AI
      </p>

      {user ? (
        <div className="mt-12 flex flex-col items-center gap-6">
          <Link
            href="/practice"
            className="inline-flex min-w-[13rem] items-center justify-center rounded-lg border border-white/82 bg-white px-8 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_36px_rgba(0,0,0,0.35)] transition hover:bg-white/95"
          >
            Continue to practice
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-light text-white/45 underline underline-offset-4 transition hover:text-white/75"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/auth"
          className="mt-12 inline-flex min-w-[13rem] items-center justify-center rounded-lg border border-white/82 bg-white px-8 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_36px_rgba(0,0,0,0.35)] transition hover:bg-white/95"
        >
          Sign in
        </Link>
      )}
    </main>
  );
}
