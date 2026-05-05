"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCanUpdate(Boolean(session));
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCanUpdate(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (!password || !confirmPassword) {
      setMessage("Please enter and confirm your new password.");
      setIsError(true);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }
    if (password.length < 6) {
      setMessage("Password should be at least 6 characters.");
      setIsError(true);
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMessage("Password updated. Redirecting…");
    setIsError(false);
    router.push("/practice");
    router.refresh();
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10 text-white/50">
        Loading…
      </main>
    );
  }

  if (!canUpdate) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-white sm:p-7">
          <p className="text-xs uppercase tracking-[0.2em] text-white/55">
            Checkride AI
          </p>
          <h1 className="mt-3 text-2xl font-medium">Link invalid or expired</h1>
          <p className="mt-2 text-sm text-white/65">
            Request a new reset link from the sign-in page.
          </p>
          <Link
            href="/auth"
            className="mt-6 inline-block rounded-md px-1.5 py-0.5 text-sm font-semibold text-white/90 underline-offset-4 transition hover:text-white"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-white/55">
          Checkride AI
        </p>
        <h1 className="mt-3 text-2xl font-medium">Set new password</h1>
        <p className="mt-2 text-sm text-white/65">
          Choose a new password for your account.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/75">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40"
              placeholder="New password"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/75">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40"
              placeholder="Confirm new password"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-lg border border-white/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Please wait…" : "Update password"}
          </button>
        </form>

        {message ? (
          <p
            className={`mt-3 text-sm ${isError ? "text-rose-300/95" : "text-amber-200/90"}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-8 border-t border-white/[0.08] pt-7">
          <Link
            href="/auth"
            className="text-sm text-white/48 transition hover:text-white/80"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
