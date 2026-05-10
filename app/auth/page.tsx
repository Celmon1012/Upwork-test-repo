"use client";

import { createClient } from "@/lib/supabase/client";
import { KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useId, useState } from "react";

type AuthMode = "signin" | "register" | "forgot";

/** After submit: dedicated screens so onboarding never feels “frozen”. */
type AuthOutcome =
  | null
  | { kind: "register_check_email"; email: string }
  | { kind: "redirecting"; label: string }
  | { kind: "forgot_sent"; email: string };

function maskEmail(value: string): string {
  const t = value.trim();
  const at = t.indexOf("@");
  if (at <= 1) return t;
  const local = t.slice(0, at);
  const domain = t.slice(at + 1);
  const shown =
    local.length <= 2
      ? `${local[0] ?? ""}•••`
      : `${local.slice(0, 2)}•••${local.slice(-1)}`;
  return `${shown}@${domain}`;
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-slate-900/25 border-t-slate-900 ${className ?? ""}`}
      aria-hidden
    />
  );
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusId = useId();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<AuthOutcome>(null);

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
        setOutcome({ kind: "forgot_sent", email });
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
          setPassword("");
          setConfirmPassword("");
          setOutcome({ kind: "register_check_email", email: email.trim() });
          return;
        }

        setOutcome({ kind: "redirecting", label: "Welcome — opening practice…" });
        window.setTimeout(() => {
          router.push("/practice");
          router.refresh();
        }, 520);
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

      setOutcome({ kind: "redirecting", label: "Signing you in…" });
      window.setTimeout(() => {
        router.push("/practice");
        router.refresh();
      }, 520);
    } finally {
      setPending(false);
    }
  }

  const shellClass =
    "w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-7";

  if (outcome?.kind === "register_check_email") {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
        <div className={shellClass}>
          <div className="flex flex-col items-center text-center">
            <div
              className="flex size-14 items-center justify-center rounded-full border border-amber-300/35 bg-amber-400/10 text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.15)]"
              aria-hidden
            >
              <Mail className="size-7 stroke-[1.5]" aria-hidden />
            </div>
            <p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/55">
              Almost there
            </p>
            <h1 className="mt-2 text-2xl font-medium tracking-tight">
              Check your email
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              We sent a confirmation link to{" "}
              <span className="font-medium text-white/92">{maskEmail(outcome.email)}</span>.
              Open it on this device to activate your account, then sign in below.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/48">
              Didn&apos;t see it? Wait a minute, check spam or promotions, then try resending from
              register again if needed.
            </p>
            <button
              type="button"
              className="mt-8 inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-lg border border-white/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              onClick={() => {
                setOutcome(null);
                setMode("signin");
                setMessage("");
                setIsError(false);
              }}
            >
              Continue to sign in
            </button>
            <button
              type="button"
              className="mt-3 text-center text-sm font-medium text-white/55 underline-offset-4 transition hover:text-white/85 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              onClick={() => {
                setOutcome(null);
                setMode("register");
                setMessage("");
                setIsError(false);
              }}
            >
              Use a different email
            </button>
          </div>
          <div className="mt-8 flex justify-center border-t border-white/[0.08] pt-7">
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

  if (outcome?.kind === "redirecting") {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
        <div className={shellClass}>
          <div
            className="flex flex-col items-center justify-center py-6 text-center"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Spinner className="size-9 border-[3px] border-white/15 border-t-white/85" />
            <p className="mt-6 text-lg font-medium text-white/95">{outcome.label}</p>
            <p className="mt-2 text-sm text-white/55">One moment.</p>
          </div>
        </div>
      </main>
    );
  }

  if (outcome?.kind === "forgot_sent") {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
        <div className={shellClass}>
          <div className="flex flex-col items-center text-center">
            <div
              className="flex size-14 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-100"
              aria-hidden
            >
              <KeyRound className="size-7 stroke-[1.5]" aria-hidden />
            </div>
            <p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/55">
              Email sent
            </p>
            <h1 className="mt-2 text-2xl font-medium tracking-tight">Reset link on the way</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              If an account exists for{" "}
              <span className="font-medium text-white/92">{maskEmail(outcome.email)}</span>, you
              will receive a password reset link shortly.
            </p>
            <p className="mt-4 text-sm text-white/48">
              Check spam or promotions. The link expires after a while for security.
            </p>
            <button
              type="button"
              className="mt-8 inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-lg border border-white/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              onClick={() => {
                setOutcome(null);
                setMode("signin");
                setMessage("");
                setIsError(false);
              }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </main>
    );
  }

  const submitLabel = isForgot
    ? "Send reset link"
    : isRegister
      ? "Create account"
      : "Sign in";
  const pendingLabel = isForgot
    ? "Sending link…"
    : isRegister
      ? "Creating your account…"
      : "Signing you in…";

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#0a1018] px-4 py-10">
      <div className={shellClass}>
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

        <div id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
          {pending ? pendingLabel : ""}
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 space-y-4"
          aria-busy={pending}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/75">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={pending}
              className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                  disabled={pending}
                  className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter password"
                />
              </label>

              {!isRegister ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMode("forgot");
                      setMessage("");
                      setIsError(false);
                    }}
                    className="text-[0.82rem] font-medium text-white/46 transition hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40"
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
                    disabled={pending}
                    className="min-h-[3.25rem] w-full rounded-lg border border-white/20 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Re-enter password"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-lg border border-white/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <>
                <Spinner />
                <span>{pendingLabel}</span>
              </>
            ) : (
              submitLabel
            )}
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
                disabled={pending}
                onClick={() => {
                  setMode("signin");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40"
              >
                Sign in
              </button>
            </p>
          ) : isRegister ? (
            <p className="text-center text-[0.92rem] leading-relaxed text-white/48">
              Already have an account?{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMode("signin");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p className="text-center text-[0.92rem] leading-relaxed text-white/48">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMode("register");
                  setMessage("");
                  setIsError(false);
                }}
                className="rounded-md px-1.5 py-0.5 font-semibold text-white/92 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40"
              >
                Register
              </button>
            </p>
          )}

          <Link
            href="/"
            className={`group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-white/38 transition hover:bg-white/[0.05] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${pending ? "pointer-events-none opacity-40" : ""}`}
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
        <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-[#0a1018] px-4 py-10 text-white/70">
          <span className="inline-block size-8 animate-spin rounded-full border-2 border-white/15 border-t-white/70" aria-hidden />
          <span className="text-sm">Loading…</span>
        </main>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
