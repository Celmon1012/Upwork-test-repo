"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      setReady(true);
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
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-end p-4 sm:p-6">
        <span className="pointer-events-none inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-lg border border-white/14 bg-black/25 px-3 text-sm text-white/50">
          …
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-end gap-2 p-4 sm:p-6">
      {user ? (
        <>
          <span className="pointer-events-none hidden max-w-[12rem] truncate self-center text-xs text-white/55 sm:inline">
            {user.email}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="pointer-events-auto inline-flex items-center rounded-lg border border-white/24 bg-black/35 px-3 py-1.5 text-sm text-white/90 backdrop-blur-sm transition hover:border-white/40 hover:bg-black/50"
          >
            Sign out
          </button>
        </>
      ) : (
        <Link
          href="/auth"
          className="pointer-events-auto inline-flex items-center rounded-lg border border-white/24 bg-black/35 px-3 py-1.5 text-sm text-white/90 backdrop-blur-sm transition hover:border-white/40 hover:bg-black/50"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
