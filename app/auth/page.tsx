"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

type AuthMode = "signin" | "register" | "forgot";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setMessage("Could not complete sign-in. Please try again.");
      setIsError(true);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (isForgot) {
      if (!email) {
        setMessage("Please enter your email.");
        setIsError(true);
        return;
      }
      const supabase = createClient();
      setPending(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
        });
        if (error) {
          setMessage(error.message);
          setIsError(true);
          return;
        }
        setMessage(
          "Check your email for a link to reset your password. If it doesn’t arrive in a few minutes, check spam.",
        );
        setIsError(false);
      } finally {
        setPending(false);
      }
      return;
    }

    if (!email || !password) {
      setMessage("Please fill email and password.");
      setIsError(true);
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }

    const supabase = createClient();
    setPending(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/practice`,
          },
        });

        if (error) {
          setMessage(error.message);
          setIsError(true);
          return;
        }

        // Supabase can return an obfuscated user (empty identities) for existing emails.
        // Treat it as "already registered" so duplicate sign-up is blocked in UX.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMessage("This email is already registered. Please sign in instead.");
          setIsError(true);
          return;
        }

        if (data.user && !data.session) {
          setMessage(
            "Check your email to confirm your account, then sign in.",
          );
          setIsError(false);
          return;
        }

        router.push("/practice");
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setIsError(true);
        return;
      }

      router.push("/practice");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-white/55">
          Checkride AI
        </p>
        <h1 className="mt-3 text-2xl font-medium">
          {isForgot ? "Reset password" : isRegister ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-white/65">
          {isForgot
            ? "We’ll email you a link to set a new password."
            : isRegister
              ? "Create your account to continue."
              : "Sign in to continue to practice."}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/75">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40"
              placeholder="you@example.com"
            />
          </label>

          {!isForgot ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/75">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40"
                  placeholder="Enter password"
                />
              </label>

              {!isRegister ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setMessage("");
                      setIsError(false);
                    }}
                    className="text-[0.82rem] font-medium text-white/46 transition hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : null}

              {isRegister ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/75">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40"
                    placeholder="Re-enter password"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-lg border border-white/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Please wait…"
              : isForgot
                ? "Send reset link"
                : isRegister
                  ? "Register"
                  : "Sign in"}
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

        <div className="mt-8 flex flex-col items-center gap-5 border-t border-white/[0.08] pt-7">
          {isForgot ? (
            <p className="text-center text-[0.92rem] leading-relaxed text-white/48">
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                Sign in
              </button>
            </p>
          ) : isRegister ? (
            <p className="text-center text-[0.92rem] leading-relaxed text-white/48">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p className="text-center text-[0.92rem] leading-relaxed text-white/48">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                Register
              </button>
            </p>
          )}

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

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10 text-white/60">
          Loading…
        </main>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
