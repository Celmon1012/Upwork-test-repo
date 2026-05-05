"use client";

import Image from "next/image";
import { ArrowRight, Bookmark, Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type EvaluationBlock,
  type OralItem,
  type ScoreValue,
} from "./content";
import {
  buildExaminerSpokenTurn,
  compactSpokenBeats,
} from "./examiner-scripts";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

type SessionPhase = "respond" | "evaluating" | "feedback";
type SnapshotPayload = {
  currentIndex?: number;
  sessionDone?: boolean;
  fromReview?: boolean;
  answerDraft?: string;
  sessionId?: string;
};
type PersistenceContext = {
  userId: string;
  sessionId: string;
};

const cinematicEase = [0.16, 1, 0.3, 1] as const;

function transitionMs(reduce: boolean | null, ms: number) {
  return reduce ? 0 : ms;
}

/** Short disposition line — shown alone before any supporting copy. */
function verdictLine(score: ScoreValue, teaching: boolean = false): string {
  if (teaching) return "Here's what I want.";
  if (score >= 3) return "Satisfactory.";
  return "Not sufficient.";
}

const SCORE_MEANING: Record<ScoreValue, string> = {
  0: "Off-target or no usable answer",
  1: "Weak / fragmented (partial knowledge, poor structure)",
  2: "Adequate but incomplete (misses 1–2 important items)",
  3: "Complete, checkride-ready answer",
};

/*
 * Oral-room presentation (not "just UI"): these timings and motion choices
 * are how the examiner *feels* — verdict weight, silence, when the next
 * line is allowed to land. Backend copy can stay fixed; this layer shapes
 * checkride-like rhythm on the client.
 */

/**
 * Verdict sits alone before any supporting examiner copy (client spec: ~800–1200ms).
 */
function verdictSoloHoldMs(reduce: boolean | null): number {
  if (reduce) return 420;
  return 800 + Math.floor(Math.random() * 401);
}

/**
 * Subtle divider / ambient reveal delay under the verdict.
 * Held until the end of the verdict-solo window so nothing
 * competes with the verdict while it lands.
 */
function judgmentFollowDelayS(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 1.0;
  if (score <= 1) return 1.38;
  if (score === 2) return 1.2;
  return 1.0;
}

/**
 * Inter-segment pause between spoken explanation parts (frontend-only pacing).
 *
 * Three moods, re-rolled per gap so rhythm varies line to line:
 *   - "cut-in" (~24%): next line lands soon after the previous.
 *   - "long hold" (~18%): uncomfortable wait before the next line.
 *   - "normal" (~58%): readable beat, length-sensitive + jitter.
 *
 * Fade-in duration for each line stays fixed elsewhere — only the *wait*
 * before the next line appears varies.
 */
function segmentRevealDelayMs(segmentText: string, reduce: boolean | null): number {
  if (reduce) return 420;
  const roll = Math.random();
  if (roll < 0.24) {
    return 280 + Math.floor(Math.random() * 380);
  }
  if (roll < 0.42) {
    const readRoom = Math.min(1300, Math.floor(segmentText.length * 10));
    return 2200 + readRoom + Math.floor(Math.random() * 900);
  }
  const base = 980;
  const readRoom = Math.min(1100, Math.floor(segmentText.length * 8));
  const jitter = Math.floor(Math.random() * 640);
  return base + readRoom + jitter;
}

/**
 * Reading dwell after the examiner has fully delivered the spoken feedback.
 *
 * Phase 1: long enough to read and sit with the moment, short enough that
 * question → answer → feedback → next still feels like one continuous oral.
 * Lower scores get a touch more dwell. Light jitter avoids a metronome feel.
 */
function readingDwellAfterSpeechMs(reduce: boolean | null, score: ScoreValue): number {
  if (reduce) return 12000;
  const jitter = Math.floor(Math.random() * 1600);
  if (score <= 1) return 16800 + jitter;
  if (score === 2) return 14800 + jitter;
  return 12800 + jitter;
}

/** Examiner think pause after submit (1.2–1.8s, slightly randomized). */
function examinerThinkingPauseMs(reduceMotion: boolean | null): number {
  if (reduceMotion) return 1500;
  return 1200 + Math.floor(Math.random() * 601);
}

/**
 * Same fixed footprint for question + feedback so the glass panel does not
 * jump between phases. Inner area scrolls when content exceeds the viewport.
 */
const ORAL_PANEL_SHELL =
  "oral-glass-panel oral-glass-panel--chamber flex h-[min(92dvh,820px)] w-full max-w-[960px] flex-col overflow-hidden";

const PRIMARY_RAIL_BTN_DISABLED =
  "disabled:pointer-events-none disabled:opacity-38 disabled:saturate-[0.85]";

/** Subtle tertiary text control */
const FOOTER_WHISPER =
  "rounded-sm border-0 bg-transparent p-0 text-left font-sans text-[0.74rem] font-normal tracking-[0.06em] text-white/40 outline-none transition-[color] duration-200 ease-out hover:text-white/65 focus-visible:text-white/85 focus-visible:ring-1 focus-visible:ring-amber-200/25";

/** Primary Answer — clear and restrained (not quiz chrome) */
const SUBMIT_ACTION =
  "inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-lg border border-white/20 bg-gradient-to-b from-white to-slate-100 px-8 py-3 font-sans text-[0.79rem] font-semibold tracking-[0.07em] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_12px_40px_rgba(0,0,0,0.44)] outline-none transition-[transform,box-shadow,filter] duration-200 ease-out hover:from-slate-50 hover:to-slate-100 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_44px_rgba(0,0,0,0.48)] active:translate-y-px focus-visible:ring-2 focus-visible:ring-amber-200/50 sm:text-[0.81rem]";

function OralEvaluationExperienceInner({
  oralItems,
}: {
  oralItems: readonly OralItem[];
}) {
  const reduceMotion = useReducedMotion();
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("respond");
  const [itemIndex, setItemIndex] = useState(0);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [evaluated, setEvaluated] = useState<EvaluationBlock | null>(null);
  const [revealedSegments, setRevealedSegments] = useState(0);
  const [showTransitionCue, setShowTransitionCue] = useState(false);
  const [showThinkingCue, setShowThinkingCue] = useState(false);
  const [justReceived, setJustReceived] = useState(false);
  const [markedItems, setMarkedItems] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [sessionDone, setSessionDone] = useState(false);
  const [fromReview, setFromReview] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const [showMeMode, setShowMeMode] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  /** Command rail only after spoken feedback + optional model checklist beat. */
  const [feedbackRailReady, setFeedbackRailReady] = useState(false);
  /** While true, bookmark + feedback actions stay hidden so the sample answer can land alone. */
  const [answerRevealChromeHidden, setAnswerRevealChromeHidden] =
    useState(false);
  /** Increments each Try again on the same item — sharper examiner copy on repeat miss. */
  const [oralRepeatMissCount, setOralRepeatMissCount] = useState(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  /** Anchor at end of examiner transcript — scrollIntoView keeps new lines in view. */
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  /** User scrolled up in debrief — pause following new lines until they return near bottom. */
  const [transcriptFollowPaused, setTranscriptFollowPaused] = useState(false);
  const dialogLabelId = useId();
  const evaluationTimerRef = useRef<number | null>(null);
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const persistenceRef = useRef<PersistenceContext | null>(null);
  const hydratedProgressRef = useRef(false);
  const [resumeReady, setResumeReady] = useState(false);

  const item = oralItems[itemIndex]!;
  const currentAnswerDraft = answerDrafts[item.id] ?? "";
  const evaluation = evaluated ?? item.evaluation;
  const feedbackLines = useMemo(
    () => getFeedbackLines(evaluation, showMeMode),
    [evaluation, showMeMode],
  );
  const SEGMENT_FADE_SECONDS = 0.88;
  const segmentDurations = useMemo(
    () => feedbackLines.map(() => SEGMENT_FADE_SECONDS),
    [feedbackLines],
  );
  const segmentCount = feedbackLines.length;
  const allSegmentsRevealed =
    segmentCount === 0 ? true : revealedSegments >= segmentCount;

  // Static sample answer lines — hidden until "Show Me Answer"; toggle also hides/shows.
  // Pulled directly from item.sampleAnswer (clean, per-question, no mixing).
  const sampleAnswerLines = useMemo(
    () => item.sampleAnswer.slice(),
    [item],
  );
  const questionDbIdSet = useMemo(
    () => oralItems.map((o) => o.questionDbId),
    [oralItems],
  );
  const indexByQuestionDbId = useMemo(() => {
    const map = new Map<string, number>();
    oralItems.forEach((o, i) => {
      map.set(o.questionDbId, i);
    });
    return map;
  }, [oralItems]);
  const slugByQuestionDbId = useMemo(() => {
    const map = new Map<string, string>();
    oralItems.forEach((o) => {
      map.set(o.questionDbId, o.id);
    });
    return map;
  }, [oralItems]);

  const persistSnapshot = useCallback(
    async (overrides?: SnapshotPayload) => {
      const ctx = persistenceRef.current;
      if (!ctx || !hydratedProgressRef.current) return;
      const active = oralItems[itemIndex];
      if (!active?.questionDbId) return;
      const answerDraft =
        overrides && "answerDraft" in overrides
          ? overrides.answerDraft
          : answerDrafts[active.id] ?? "";
      const payload: SnapshotPayload = {
        currentIndex: itemIndex,
        sessionDone: sessionDone,
        fromReview: fromReview,
        answerDraft,
        sessionId: ctx.sessionId,
        ...overrides,
      };
      await supabaseRef.current.from("progress_snapshots").upsert(
        {
          user_id: ctx.userId,
          question_id: active.questionDbId,
          payload,
          version: 1,
        },
        { onConflict: "user_id,question_id" },
      );
    },
    [answerDrafts, fromReview, itemIndex, oralItems, sessionDone],
  );

  const persistAttempt = useCallback(
    async (answer: string, block: EvaluationBlock) => {
      const ctx = persistenceRef.current;
      if (!ctx || !item.questionDbId) return;
      const { data: created, error } = await supabaseRef.current
        .from("attempts")
        .insert({
          user_id: ctx.userId,
          question_id: item.questionDbId,
          raw_answer: answer,
          session_id: ctx.sessionId,
        })
        .select("id")
        .single();
      if (error || !created?.id) return;
      await supabaseRef.current.from("attempt_scores").insert({
        attempt_id: created.id,
        rules_score: block.score,
        final_score: block.score,
        score_source: "rules",
        matched_points: [],
        missed_points: block.missed,
      });
    },
    [item.questionDbId],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      if (questionDbIdSet.length === 0) {
        hydratedProgressRef.current = true;
        setResumeReady(true);
        return;
      }
      const {
        data: { user },
      } = await supabaseRef.current.auth.getUser();
      if (cancelled) return;
      if (!user?.id) {
        hydratedProgressRef.current = true;
        setResumeReady(true);
        return;
      }
      const [bookmarksRes, snapshotsRes, attemptsRes] = await Promise.all([
        supabaseRef.current
          .from("bookmarks")
          .select("question_id")
          .eq("user_id", user.id)
          .in("question_id", questionDbIdSet),
        supabaseRef.current
          .from("progress_snapshots")
          .select("question_id,payload,updated_at")
          .eq("user_id", user.id)
          .in("question_id", questionDbIdSet)
          .order("updated_at", { ascending: false }),
        supabaseRef.current
          .from("attempts")
          .select("question_id,raw_answer,submitted_at")
          .eq("user_id", user.id)
          .in("question_id", questionDbIdSet)
          .order("submitted_at", { ascending: false }),
      ]);
      if (cancelled) return;

      if (bookmarksRes.data) {
        const nextMarked = new Set<string>();
        for (const row of bookmarksRes.data) {
          const slug = slugByQuestionDbId.get(String(row.question_id));
          if (slug) nextMarked.add(slug);
        }
        setMarkedItems(nextMarked);
      }

      const snapshots = snapshotsRes.data ?? [];
      const latest = snapshots[0];
      const payload =
        latest?.payload && typeof latest.payload === "object"
          ? (latest.payload as SnapshotPayload)
          : null;
      const persistedSessionId =
        typeof payload?.sessionId === "string" && payload.sessionId.length > 0
          ? payload.sessionId
          : null;
      persistenceRef.current = {
        userId: user.id,
        sessionId: persistedSessionId ?? crypto.randomUUID(),
      };

      const draftsByQuestionId = new Map<string, string>();
      for (const snapshot of snapshots) {
        if (!snapshot?.question_id) continue;
        const snapshotPayload =
          snapshot.payload && typeof snapshot.payload === "object"
            ? (snapshot.payload as SnapshotPayload)
            : null;
        if (typeof snapshotPayload?.answerDraft === "string") {
          draftsByQuestionId.set(String(snapshot.question_id), snapshotPayload.answerDraft);
        }
      }
      if (attemptsRes.data) {
        for (const row of attemptsRes.data) {
          const questionId = String(row.question_id ?? "");
          if (!questionId || draftsByQuestionId.has(questionId)) continue;
          if (typeof row.raw_answer === "string") {
            draftsByQuestionId.set(questionId, row.raw_answer);
          }
        }
      }
      if (draftsByQuestionId.size > 0) {
        const nextDrafts: Record<string, string> = {};
        draftsByQuestionId.forEach((draft, questionId) => {
          const slug = slugByQuestionDbId.get(questionId);
          if (slug) nextDrafts[slug] = draft;
        });
        setAnswerDrafts(nextDrafts);
      }
      if (payload) {
        const resumeIndex = Number(payload.currentIndex);
        if (Number.isFinite(resumeIndex)) {
          const bounded = Math.max(0, Math.min(oralItems.length - 1, resumeIndex));
          setItemIndex(bounded);
        } else if (latest?.question_id) {
          const fromQuestion = indexByQuestionDbId.get(String(latest.question_id));
          if (typeof fromQuestion === "number") setItemIndex(fromQuestion);
        }
        setSessionDone(Boolean(payload.sessionDone));
        setFromReview(Boolean(payload.fromReview));
      }

      hydratedProgressRef.current = true;
      setResumeReady(true);
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [indexByQuestionDbId, oralItems.length, questionDbIdSet, slugByQuestionDbId]);

  const runEvaluation = useCallback(() => {
    const answer = currentAnswerDraft.trim();
    if (!answer) {
      setAnswerError("Nothing there yet.");
      answerRef.current?.focus();
      return;
    }
    if (evaluationTimerRef.current) {
      window.clearTimeout(evaluationTimerRef.current);
      evaluationTimerRef.current = null;
    }
    setAnswerError(null);
    const block = evaluateAnswer(item, answer, oralRepeatMissCount);
    void persistAttempt(answer, block);
    setEvaluated(block);
    if (block.score >= 3) setOralRepeatMissCount(0);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setSessionPhase("evaluating");
    void persistSnapshot({ answerDraft: answer });
    const pauseMs = examinerThinkingPauseMs(reduceMotion);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [
    currentAnswerDraft,
    item,
    oralRepeatMissCount,
    persistAttempt,
    persistSnapshot,
    reduceMotion,
  ]);

  // Skip answering — go straight to the examiner showing you a strong answer.
  // Same environmental pacing, shorter think-pause (they aren't grading).
  const runShowMe = useCallback(() => {
    if (evaluationTimerRef.current) {
      window.clearTimeout(evaluationTimerRef.current);
      evaluationTimerRef.current = null;
    }
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(true);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(true);
    setJustReceived(true);
    setOralRepeatMissCount(0);
    setSessionPhase("evaluating");
    const pauseMs = examinerThinkingPauseMs(reduceMotion);
    evaluationTimerRef.current = window.setTimeout(() => {
      setSessionPhase("feedback");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [reduceMotion]);

  const advanceFromFeedback = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
    if (fromReview) {
      setFromReview(false);
      setSessionDone(true);
    } else if (itemIndex >= oralItems.length - 1) {
      setSessionDone(true);
    } else {
      setItemIndex((i) => i + 1);
    }
  }, [fromReview, itemIndex, oralItems.length]);

  // The pushback. Same question, cleared textarea, focus restored.
  // The examiner isn't giving up the answer — they're making the user talk again.
  const tryAgain = useCallback(() => {
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setAnswerDrafts((prev) => ({ ...prev, [item.id]: "" }));
    void persistSnapshot({ answerDraft: "" });
    setOralRepeatMissCount((n) => n + 1);
    // itemIndex intentionally unchanged — same item, another pass.
  }, [item.id, persistSnapshot]);

  const toggleMark = useCallback(() => {
    const ctx = persistenceRef.current;
    if (ctx?.userId && item.questionDbId) {
      if (markedItems.has(item.id)) {
        void supabaseRef.current
          .from("bookmarks")
          .delete()
          .eq("user_id", ctx.userId)
          .eq("question_id", item.questionDbId);
      } else {
        void supabaseRef.current.from("bookmarks").upsert(
          {
            user_id: ctx.userId,
            question_id: item.questionDbId,
          },
          { onConflict: "user_id,question_id" },
        );
      }
    }
    setMarkedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, [item.id, item.questionDbId, markedItems]);

  // Mark current item for later and immediately move on — no confirmation.
  const reviewLater = useCallback(() => {
    const ctx = persistenceRef.current;
    if (ctx?.userId && item.questionDbId) {
      void supabaseRef.current.from("bookmarks").upsert(
        {
          user_id: ctx.userId,
          question_id: item.questionDbId,
        },
        { onConflict: "user_id,question_id" },
      );
    }
    setMarkedItems((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    advanceFromFeedback();
  }, [advanceFromFeedback, item.id, item.questionDbId]);

  // Jump to a specific item from the end-of-session review screen.
  const startReviewItem = useCallback((id: string) => {
    const index = oralItems.findIndex((o) => o.id === id);
    if (index === -1) return;
    setItemIndex(index);
    setFromReview(true);
    setSessionDone(false);
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
  }, [oralItems]);

  // Restart entire session from question one.
  const startOver = useCallback(() => {
    const ctx = persistenceRef.current;
    if (ctx?.userId) {
      void Promise.all([
        supabaseRef.current
          .from("bookmarks")
          .delete()
          .eq("user_id", ctx.userId)
          .in("question_id", questionDbIdSet),
        supabaseRef.current
          .from("progress_snapshots")
          .delete()
          .eq("user_id", ctx.userId)
          .in("question_id", questionDbIdSet),
      ]);
    }
    setSessionDone(false);
    setFromReview(false);
    setItemIndex(0);
    setMarkedItems(new Set());
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
    setAnswerDrafts({});
  }, [questionDbIdSet]);

  const openReviewLaterList = useCallback(() => {
    setSessionDone(true);
    setFromReview(false);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";

  useEffect(() => {
    setOralRepeatMissCount(0);
  }, [itemIndex]);

  useEffect(() => {
    setTranscriptFollowPaused(false);
  }, [item.id]);

  useEffect(() => {
    if (sessionPhase === "feedback") setTranscriptFollowPaused(false);
  }, [sessionPhase]);

  useEffect(() => {
    if (!resumeReady) return;
    void persistSnapshot();
  }, [fromReview, itemIndex, persistSnapshot, resumeReady, sessionDone]);

  useEffect(() => {
    if (!resumeReady) return;
    const timer = window.setTimeout(() => {
      void persistSnapshot({ answerDraft: currentAnswerDraft });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentAnswerDraft, persistSnapshot, resumeReady]);

  /** Open: hide all chrome first, then show answer body; close: restore immediately. */
  const toggleAnswer = useCallback(() => {
    setShowAnswer((prev) => {
      if (prev) {
        setAnswerRevealChromeHidden(false);
        return false;
      }
      setAnswerRevealChromeHidden(true);
      return true;
    });
  }, []);

  // After "Show me the answer", keep bookmark + actions hidden until the
  // expanded block has had time to open and the last line has finished fading in.
  useEffect(() => {
    if (!showAnswer || !answerRevealChromeHidden || showMeMode) return;

    if (reduceMotion) {
      setAnswerRevealChromeHidden(false);
      return;
    }

    const n = sampleAnswerLines.length;
    if (n === 0) {
      setAnswerRevealChromeHidden(false);
      return;
    }

    // Match motion.div height (~0.55s) + label delay + last line delay + fade.
    // label at 0, lines staggered at 0.18 + index * 0.38 + 0.65s fade.
    const lastLineEndMs = (0.18 + (n - 1) * 0.38 + 0.65) * 1000;
    const totalMs = Math.round(550 + lastLineEndMs + 220);

    const id = window.setTimeout(() => {
      setAnswerRevealChromeHidden(false);
    }, totalMs);
    return () => window.clearTimeout(id);
  }, [
    answerRevealChromeHidden,
    sampleAnswerLines.length,
    item.id,
    reduceMotion,
    showAnswer,
    showMeMode,
  ]);

  useEffect(() => {
    if (sessionPhase === "respond") {
      answerRef.current?.focus();
    }
  }, [itemIndex, sessionPhase]);

  // Transient "answer received" beat — an environmental acknowledgement
  // that the examiner heard the response before beginning to think.
  useEffect(() => {
    if (!justReceived) return;
    const hold = 230 + Math.floor(Math.random() * 130);
    const timer = window.setTimeout(() => setJustReceived(false), hold);
    return () => window.clearTimeout(timer);
  }, [justReceived]);

  const onTranscriptScroll = useCallback(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const threshold = 80;
    const fromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setTranscriptFollowPaused(fromBottom > threshold);
  }, []);

  /** Follow examiner transcript as lines reveal — respects manual scroll-up. */
  useEffect(() => {
    if (sessionPhase !== "feedback" || transcriptFollowPaused) return;
    const el = transcriptEndRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    allSegmentsRevealed,
    feedbackLines.length,
    item.id,
    reduceMotion,
    revealedSegments,
    sessionPhase,
    showAnswer,
    feedbackRailReady,
    transcriptFollowPaused,
  ]);

  /** When debrief completes, bring actions into view (inside scroll region). */
  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    const el = transcriptEndRef.current;
    if (!el) return;
    const ms = reduceMotion ? 80 : 340;
    const id = window.setTimeout(() => {
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }, ms);
    return () => window.clearTimeout(id);
  }, [
    allSegmentsRevealed,
    feedbackRailReady,
    item.id,
    reduceMotion,
    sessionPhase,
    showAnswer,
  ]);

  // Keyboard Enter follows the explicit Continue action in Phase 2.
  const primaryAfterFeedback = useCallback(() => {
    advanceFromFeedback();
  }, [advanceFromFeedback]);

  const continueFeedbackEnabled =
    feedbackRailReady && !(showAnswer && answerRevealChromeHidden);

  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed || !continueFeedbackEnabled)
      return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        if (showAnswer && answerRevealChromeHidden) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        primaryAfterFeedback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    allSegmentsRevealed,
    answerRevealChromeHidden,
    continueFeedbackEnabled,
    primaryAfterFeedback,
    sessionPhase,
    showAnswer,
  ]);

  useEffect(() => {
    return () => {
      if (evaluationTimerRef.current) {
        window.clearTimeout(evaluationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sessionPhase !== "feedback") return;
    if (feedbackLines.length === 0) return;

    const timers: number[] = [];
    let cumulative = verdictSoloHoldMs(reduceMotion);
    for (let i = 0; i < feedbackLines.length; i++) {
      const index = i;
      timers.push(
        window.setTimeout(() => {
          setRevealedSegments(index + 1);
        }, cumulative),
      );
      if (i < feedbackLines.length - 1) {
        let gap = segmentRevealDelayMs(feedbackLines[i]!.text, reduceMotion);
        if (
          i === 0 &&
          evaluation.score < 3 &&
          !showMeMode &&
          feedbackLines.length > 1
        ) {
          gap += 200 + Math.floor(Math.random() * 280);
        }
        cumulative += gap;
      }
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    evaluation.score,
    feedbackLines,
    reduceMotion,
    sessionPhase,
    showMeMode,
  ]);

  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) {
      setFeedbackRailReady(false);
      return;
    }
    if (showMeMode) {
      setFeedbackRailReady(true);
      return;
    }
    if (sampleAnswerLines.length === 0) {
      setFeedbackRailReady(true);
      return;
    }
    // Strong answer stays hidden until user taps "Show Me Answer"; rail after a short beat.
    const ms = reduceMotion ? 160 : 280;
    const id = window.setTimeout(() => setFeedbackRailReady(true), ms);
    return () => window.clearTimeout(id);
  }, [
    allSegmentsRevealed,
    item.id,
    reduceMotion,
    sampleAnswerLines.length,
    sessionPhase,
    showMeMode,
  ]);

  // End-of-moment pacing.
  //
  // Phase 2: after feedback, the user chooses from explicit actions. We keep
  // only the soft wrap-up cue timing and remove timed auto-advance.
  useEffect(() => {
    if (sessionPhase !== "feedback" || !allSegmentsRevealed) return;
    // User opened the full model answer — stay with them.
    if (showAnswer) return;
    // Failed / incomplete — hold. No timed cue, no auto-advance.
    if (evaluation.score < 3 && !showMeMode) return;

    const dwell = readingDwellAfterSpeechMs(reduceMotion, evaluation.score);
    const cueLead = reduceMotion
      ? 2400
      : 3200 + Math.floor(Math.random() * 700);
    const cueTimer = window.setTimeout(
      () => setShowTransitionCue(true),
      Math.max(0, dwell - cueLead),
    );
    return () => {
      window.clearTimeout(cueTimer);
    };
  }, [
    allSegmentsRevealed,
    evaluation.score,
    reduceMotion,
    sessionPhase,
    showAnswer,
    showMeMode,
  ]);

  if (!resumeReady) {
    return (
      <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(30,58,95,0.22)_0%,transparent_50%),linear-gradient(180deg,#070a12_0%,#04060c_100%)]">
        <BackgroundStack phase="respond" justReceived={false} />
      </div>
    );
  }

  if (sessionDone) {
    return (
      <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(30,58,95,0.22)_0%,transparent_50%),linear-gradient(180deg,#070a12_0%,#04060c_100%)]">
        <BackgroundStack phase="respond" justReceived={false} />
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
            <SessionEndScreen
              oralItems={oralItems}
              markedItems={markedItems}
              onRetryItem={startReviewItem}
              onStartOver={startOver}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(30,58,95,0.22)_0%,transparent_50%),linear-gradient(180deg,#070a12_0%,#04060c_100%)]">
      <BackgroundStack phase={sessionPhase} justReceived={justReceived} />

      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-visible px-5 py-6 sm:px-12 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              role="region"
              aria-label={item.contextLabel}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{
                duration: transitionMs(reduceMotion, 0.9),
                ease: cinematicEase,
              }}
              className="relative mx-auto flex min-h-0 w-full max-w-[min(96vw,960px)] flex-col"
            >
            <div
              className={`${ORAL_PANEL_SHELL} transition-[box-shadow,ring-color] duration-700 ease-out ${
                evaluating
                  ? "ring-1 ring-amber-200/[0.14] shadow-[0_40px_120px_rgba(0,0,0,0.88)]"
                  : "ring-1 ring-white/[0.05] shadow-[0_32px_100px_rgba(0,0,0,0.72)]"
              }`}
            >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <header className="shrink-0 border-b border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent px-8 pb-3.5 pt-6 sm:px-11 sm:pb-4 sm:pt-7">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className="mt-1.5 h-8 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-amber-200/70 via-amber-100/35 to-transparent"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-sans text-[0.56rem] font-semibold uppercase tracking-[0.28em] text-amber-100/45">
                        Oral evaluation
                      </p>
                      <p className="mt-1.5 max-w-[85%] font-sans text-[0.76rem] font-medium leading-snug tracking-[0.04em] text-white/[0.72] sm:text-[0.8rem]">
                        {item.contextLabel}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-sans text-[0.52rem] font-semibold uppercase tracking-[0.2em] text-white/32">
                      Item
                    </p>
                    <p className="mt-0.5 tabular-nums font-sans text-[0.8rem] font-medium tracking-[0.06em] text-white/[0.55]">
                      {String(itemIndex + 1).padStart(2, "0")}
                      <span className="text-white/25">/</span>
                      {String(oralItems.length).padStart(2, "0")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-px w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-200/35 via-white/12 to-white/[0.06] transition-[width] duration-700 ease-out"
                    style={{
                      width: `${Math.max(4, ((itemIndex + 1) / oralItems.length) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.04] pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <SessionPhaseStrip phase={sessionPhase} />
                  <p className="oral-trust-footnote font-sans sm:shrink-0">
                    Training simulation — supplements ACS prep; not an FAA examination or
                    endorsement.
                  </p>
                </div>
              </header>

              <AnimatePresence mode="wait" initial={false}>
                {showQuestionChrome ? (
                  <motion.div
                    key={`respond-${item.id}`}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{
                      duration: transitionMs(reduceMotion, 0.36),
                      ease: cinematicEase,
                    }}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <div className="oral-scrollbar-modern relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-8 py-6 text-left sm:px-11 sm:py-7">
                      <motion.div
                        animate={{
                          opacity: evaluating ? 0.5 : 1,
                        }}
                        transition={{
                          duration: transitionMs(reduceMotion, 1.0),
                          ease: cinematicEase,
                        }}
                      >
                        <p className="font-sans text-[0.56rem] font-semibold uppercase tracking-[0.26em] text-white/32">
                          Examiner asks
                        </p>
                        <h1 className="mt-2 max-w-[42rem] font-serif text-[1.72rem] font-medium leading-[1.28] tracking-[-0.02em] text-white [text-shadow:0_2px_40px_rgba(0,0,0,0.55)] sm:text-[2.05rem] sm:leading-[1.2]">
                          {item.promptLine}
                        </h1>
                        {item.scenario ? (
                          <p className="mt-5 max-w-[38rem] border-l border-amber-200/25 pl-4 font-sans text-[0.84rem] font-normal leading-[1.78] tracking-[0.02em] text-white/55 sm:mt-6 sm:text-[0.88rem]">
                            {item.scenario}
                          </p>
                        ) : null}
                      </motion.div>
                      <motion.div
                        key="answer-area"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? undefined : { opacity: 0 }}
                        transition={{
                          duration: transitionMs(reduceMotion, 0.32),
                          ease: cinematicEase,
                        }}
                        className="mt-8 flex min-h-0 flex-1 flex-col sm:mt-9"
                      >
                        <label htmlFor="oral-answer" className="sr-only">
                          Your answer to the examiner
                        </label>
                        <p className="mb-2 font-sans text-[0.56rem] font-semibold uppercase tracking-[0.22em] text-white/28">
                          Your response
                        </p>
                        <div
                          className={`oral-debrief-well oral-input-wrap relative min-h-[13rem] flex-1 min-w-0 overflow-hidden transition-[opacity,filter] duration-500 ease-out sm:min-h-[16rem] ${
                            evaluating ? "opacity-45" : "opacity-100"
                          }`}
                        >
                          {/*
                            Inset pulls the field off the border; internal padding refines type area.
                          */}
                          <textarea
                            ref={answerRef}
                            id="oral-answer"
                            rows={7}
                            value={currentAnswerDraft}
                            readOnly={evaluating}
                            placeholder="State your answer clearly, as you would to the examiner."
                            aria-invalid={Boolean(answerError)}
                            aria-describedby={answerError ? "oral-answer-error" : undefined}
                            onChange={(event) => {
                              setAnswerDrafts((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }));
                              if (answerError) setAnswerError(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                if (!evaluating) runEvaluation();
                              }
                            }}
                            className="oral-answer-line absolute inset-2.5 box-border resize-none rounded-[8px] border-0 bg-transparent px-4 pb-6 pt-3.5 font-serif text-[1rem] font-light leading-[1.85] tracking-[0.01em] text-white/[0.94] shadow-none transition-all duration-200 focus:outline-none sm:inset-3 sm:rounded-[9px] sm:px-5 sm:pb-7 sm:pt-4 sm:text-[1.04rem]"
                          />
                        </div>
                        {answerError && (
                          <p
                            id="oral-answer-error"
                            className="mt-2 text-[0.74rem] font-normal text-rose-300/90"
                            role="alert"
                          >
                            {answerError}
                          </p>
                        )}
                      </motion.div>
                    </div>

                    <div className="oral-evaluator-dock-wrap shrink-0">
                      <div className="oral-evaluator-dock-inner px-3 py-2 sm:px-5 sm:py-2.5">
                        <div className="oral-action-dock oral-action-dock--premium relative overflow-hidden rounded-[14px] px-3 py-2.5 sm:px-4 sm:py-3">
                          <div
                            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
                            aria-hidden
                          />
                          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="flex min-h-[2.25rem] min-w-0 flex-1 flex-col justify-center gap-2">
                              <span className="sr-only" role="status" aria-live="polite">
                                {evaluating ? "Examiner is evaluating." : ""}
                              </span>
                              {evaluating && showThinkingCue ? (
                                <p className="font-sans text-[0.7rem] font-medium uppercase tracking-[0.2em] text-amber-100/45">
                                  Examiner deliberating…
                                </p>
                              ) : !evaluating ? (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <button
                                    type="button"
                                    onClick={runShowMe}
                                    className="text-left font-sans text-[0.72rem] font-medium uppercase tracking-[0.14em] text-white/35 underline decoration-white/10 underline-offset-[5px] transition-colors hover:text-amber-100/55 hover:decoration-amber-200/28"
                                  >
                                    Show model answer
                                  </button>
                                  {markedItems.size > 0 ? (
                                    <button
                                      type="button"
                                      onClick={openReviewLaterList}
                                      className={FOOTER_WHISPER}
                                    >
                                      Review later ({markedItems.size})
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {!evaluating && (
                              <button type="button" onClick={runEvaluation} className={SUBMIT_ACTION}>
                                Submit for evaluation
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`feedback-${item.id}`}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{
                      duration: transitionMs(reduceMotion, 0.42),
                      ease: cinematicEase,
                    }}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <span className="sr-only">{item.contextLabel}</span>

                    <div className="oral-prompt-recap shrink-0 px-5 py-3 sm:px-8 sm:py-3.5">
                      <p className="font-sans text-[0.52rem] font-semibold uppercase tracking-[0.26em] text-white/36">
                        Item recap
                      </p>
                      <p className="mt-1 line-clamp-2 max-w-[52rem] font-serif text-[0.84rem] font-light leading-snug tracking-[0.02em] text-white/70 sm:text-[0.88rem]">
                        {item.promptLine}
                      </p>
                    </div>

                    <div className="shrink-0 px-8 pb-3 pt-3 sm:px-11 sm:pb-4 sm:pt-4">
                      <JudgmentBlock
                        id={dialogLabelId}
                        value={evaluation.score}
                        judgment={evaluation.judgment}
                        examinerNote={evaluation.examinerNote}
                        align="immersive"
                        settled={revealedSegments > 0}
                        teaching={showMeMode}
                      />
                    </div>

                    <div
                      ref={transcriptScrollRef}
                      onScroll={onTranscriptScroll}
                      className="oral-scrollbar-modern relative z-[1] mx-4 mb-2 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl px-4 pb-4 pt-2 sm:mx-5 sm:px-5"
                      role="log"
                      aria-live="polite"
                      aria-relevant="additions"
                      aria-label="Examiner feedback"
                    >
                      <div className="oral-debrief-well px-3 py-3 sm:px-4 sm:py-4">
                        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2.5">
                          <p className="font-sans text-[0.56rem] font-semibold uppercase tracking-[0.22em] text-amber-100/40">
                            Oral debrief
                          </p>
                          <p className="oral-debrief-row-num font-sans text-[0.58rem] text-white/30">
                            {Math.min(revealedSegments, feedbackLines.length)}
                            <span className="text-white/18"> / </span>
                            {feedbackLines.length}
                          </p>
                        </div>
                        <ol className="m-0 flex list-none flex-col gap-0 p-0">
                          {feedbackLines.map((unit, index) => {
                            if (index >= revealedSegments) return null;
                            const duration = segmentDurations[index] ?? 0.88;
                            const n = index + 1;
                            return (
                              <li
                                key={`${item.id}-fb-${index}`}
                                className={
                                  index === 0
                                    ? "mt-0 border-l border-amber-200/15 pl-3 sm:pl-4"
                                    : "mt-4 border-l border-white/[0.08] pl-3 sm:mt-5 sm:pl-4"
                                }
                              >
                                <div className="flex gap-2.5 sm:gap-3">
                                  <span
                                    className="oral-debrief-row-num mt-0.5 w-7 shrink-0 font-sans text-[0.65rem] font-semibold text-amber-200/50 sm:w-8 sm:text-[0.7rem]"
                                    aria-hidden
                                  >
                                    {n.toString().padStart(2, "0")}
                                  </span>
                                  <motion.p
                                    initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                                    animate={
                                      reduceMotion
                                        ? { opacity: 1, y: 0 }
                                        : {
                                            opacity: [0, 0.2, 0.5, 1],
                                            y: [6, 4, 2, 0],
                                          }
                                    }
                                    transition={{
                                      duration: transitionMs(reduceMotion, duration),
                                      times: reduceMotion
                                        ? undefined
                                        : [0, 0.15, 0.32, 1],
                                      ease: cinematicEase,
                                    }}
                                    className="min-w-0 max-w-[40rem] font-serif text-[0.93rem] font-light leading-[1.8] tracking-[0.01em] text-white/[0.92] sm:text-[0.98rem]"
                                  >
                                    {withThinkingLead(unit.text, index, evaluation.score)}
                                  </motion.p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>

                        <AnimatePresence initial={false}>
                          {allSegmentsRevealed && showAnswer && !showMeMode && (
                            <motion.div
                              key="answer-reveal"
                              className="mt-6 flex flex-col rounded-[12px] border border-white/[0.09] bg-[linear-gradient(142deg,rgba(255,255,255,0.06)_0%,rgba(12,16,28,0.65)_42%,rgba(4,6,14,0.92)_100%)] px-4 py-5 pl-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_3px_0_0_rgba(212,175,95,0.28)] sm:mt-7 sm:px-5 sm:py-6"
                              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                              transition={{
                                duration: transitionMs(reduceMotion, 0.55),
                                ease: cinematicEase,
                              }}
                            >
                              <motion.p
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{
                                  duration: transitionMs(reduceMotion, 0.4),
                                  delay: reduceMotion ? 0 : 0.08,
                                  ease: cinematicEase,
                                }}
                                className="font-sans text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-amber-100/50"
                              >
                                Checkride-standard answer
                              </motion.p>
                              {sampleAnswerLines.map((line, index) => (
                                <motion.p
                                  key={`${item.id}-sample-${index}`}
                                  initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    duration: transitionMs(reduceMotion, 0.55),
                                    delay: reduceMotion ? 0 : 0.12 + index * 0.22,
                                    ease: cinematicEase,
                                  }}
                                  className={`font-serif text-[0.9rem] font-light leading-[1.82] tracking-[0.01em] text-white/[0.9] sm:text-[0.95rem] ${
                                    index === 0 ? "mt-3" : "mt-2"
                                  }`}
                                >
                                  {line}
                                </motion.p>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {allSegmentsRevealed ? (
                        <div className="oral-evaluator-dock-wrap oral-evaluator-dock-wrap--in-scroll mt-4 shrink-0">
                          <FeedbackCommandRail
                            score={evaluation.score}
                            teaching={showMeMode}
                            showAnswer={showAnswer}
                            onToggleAnswer={toggleAnswer}
                            onTryAgain={tryAgain}
                            onNextQuestion={advanceFromFeedback}
                            onReviewLater={reviewLater}
                            reduceMotion={reduceMotion}
                            continueEnabled={continueFeedbackEnabled}
                            secondaryUnlocked
                          />
                        </div>
                      ) : null}

                      <div
                        ref={transcriptEndRef}
                        className="h-2 shrink-0 scroll-mt-4"
                        aria-hidden
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Secondary: calm outline, icon-first */
const SECONDARY_RAIL_BTN =
  "inline-flex h-9 min-h-[40px] items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.03] px-3.5 font-sans text-[0.73rem] font-medium tracking-[0.04em] text-white/[0.88] outline-none transition-[border-color,background-color,color,transform,opacity] hover:border-amber-200/25 hover:bg-white/[0.06] hover:text-white active:translate-y-px focus-visible:ring-2 focus-visible:ring-amber-200/35 disabled:pointer-events-none disabled:opacity-30 sm:px-4";

/** Primary: decisive forward action */
const PRIMARY_RAIL_BTN =
  `inline-flex h-10 min-h-[44px] min-w-[10.25rem] shrink-0 items-center justify-center gap-2 rounded-md border border-white/22 bg-gradient-to-b from-[#fafaf9] via-slate-50 to-slate-200/95 px-5 font-sans text-[0.78rem] font-semibold tracking-[0.06em] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_8px_28px_rgba(0,0,0,0.4)] outline-none transition-[transform,box-shadow,filter,opacity] hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-amber-200/50 active:translate-y-px ${PRIMARY_RAIL_BTN_DISABLED}`;

function FeedbackCommandRail({
  score,
  teaching,
  showAnswer,
  onToggleAnswer,
  onTryAgain,
  onNextQuestion,
  onReviewLater,
  reduceMotion,
  continueEnabled,
  secondaryUnlocked,
}: {
  score: ScoreValue;
  teaching: boolean;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  onTryAgain: () => void;
  onNextQuestion: () => void;
  onReviewLater: () => void;
  reduceMotion: boolean | null;
  continueEnabled: boolean;
  secondaryUnlocked: boolean;
}) {
  const scoreMeaning = SCORE_MEANING[score];

  return (
    <motion.div
      className="relative"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.38),
        ease: cinematicEase,
      }}
    >
      <div className="oral-evaluator-dock-inner px-3 py-1.5 sm:px-4 sm:py-2">
        <div className="oral-action-dock oral-action-dock--premium relative overflow-hidden rounded-[14px] px-3 py-2.5 backdrop-blur-[2px] sm:px-4 sm:py-3">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
            aria-hidden
          />

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onTryAgain}
                  disabled={!secondaryUnlocked}
                  className={SECONDARY_RAIL_BTN}
                >
                  <RotateCcw className="size-[14px] shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                  Try Again
                </button>
                {!teaching ? (
                  <button
                    type="button"
                    onClick={onToggleAnswer}
                    disabled={!secondaryUnlocked}
                    className={SECONDARY_RAIL_BTN}
                  >
                    {showAnswer ? (
                      <EyeOff className="size-[14px] shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                    ) : (
                      <Eye className="size-[14px] shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                    )}
                    {showAnswer ? "Hide answer" : "Show Me Answer"}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onReviewLater}
                disabled={!secondaryUnlocked}
                className="inline-flex w-fit items-center gap-1.5 font-sans text-[0.64rem] font-medium tracking-[0.08em] text-white/28 transition-colors hover:text-amber-100/42 focus-visible:text-white/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-200/22 disabled:pointer-events-none disabled:opacity-25"
              >
                <Bookmark className="size-3 opacity-50" strokeWidth={2} aria-hidden />
                Review Later
              </button>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1 self-end sm:self-start">
              {!continueEnabled ? (
                <p className="max-w-[13rem] text-right font-sans text-[0.56rem] font-medium uppercase tracking-[0.14em] text-white/30">
                  Awaiting debrief
                </p>
              ) : null}
              <span className="sr-only">Primary action</span>
              <button
                type="button"
                onClick={onNextQuestion}
                disabled={!continueEnabled}
                className={PRIMARY_RAIL_BTN}
              >
                Continue
                <ArrowRight className="size-[14px] shrink-0" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!teaching ? (
        <p className="border-t border-white/[0.05] px-3 pb-0.5 pt-2 text-center font-sans text-[0.55rem] font-normal tracking-[0.08em] text-white/20 sm:px-5">
          <span className="tabular-nums text-white/30">{`${score}/3`}</span>
          <span className="mx-2.5 text-white/10">·</span>
          <span className="font-normal normal-case tracking-normal text-white/24">{scoreMeaning}</span>
        </p>
      ) : null}
    </motion.div>
  );
}

function SessionPhaseStrip({
  phase,
}: {
  phase: SessionPhase;
}) {
  const steps: readonly { id: SessionPhase; label: string; hint: string }[] = [
    { id: "respond", label: "Respond", hint: "Your oral answer" },
    { id: "evaluating", label: "Deliberation", hint: "Examiner review" },
    { id: "feedback", label: "Debrief", hint: "Structured feedback" },
  ];
  const activeIndex =
    phase === "respond" ? 0 : phase === "evaluating" ? 1 : 2;

  return (
    <div
      className="flex flex-wrap items-center gap-y-2 sm:gap-x-1"
      role="list"
      aria-label="Session phase"
    >
      {steps.map((step, i) => {
        const active = i === activeIndex;
        const done = i < activeIndex;
        return (
          <span key={step.id} className="flex items-center" role="listitem">
            {i > 0 ? (
              <span
                className="mx-1 hidden text-[0.55rem] text-white/15 sm:inline"
                aria-hidden
              >
                →
              </span>
            ) : null}
            <span
              className={`oral-phase-pill inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 ${
                active
                  ? "oral-phase-pill--active"
                  : done
                    ? "oral-phase-pill--done"
                    : "oral-phase-pill--idle"
              }`}
              title={step.hint}
            >
              <span className="tabular-nums opacity-80">{i + 1}</span>
              {step.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function BackgroundStack({
  phase,
  justReceived,
}: {
  phase: SessionPhase;
  justReceived: boolean;
}) {
  const evaluating = phase === "evaluating";
  const feedback = phase === "feedback";
  const respond = phase === "respond";

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {/* Cockpit image — photo is visible; dims slightly per phase for focus */}
      <Image
        src="/cockpit-bg.png"
        alt=""
        fill
        priority
        unoptimized
        className={`object-cover object-center transition-all duration-[1600ms] ease-out ${
          evaluating
            ? "scale-[1.042] brightness-[0.52] saturate-[0.82]"
            : feedback
              ? "scale-[1.028] brightness-[0.65] saturate-[0.9]"
              : respond
                ? "scale-[1.018] brightness-[0.71] saturate-[0.92]"
                : "brightness-[0.71]"
        }`}
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_72%_68%_at_50%_48%,transparent_32%,rgba(0,0,0,0.62)_100%)]"
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-[#04060c]/76" aria-hidden />
      <div className="absolute inset-0 bg-black/12" aria-hidden />
      {evaluating && (
        <>
          <div
            className="absolute inset-0 bg-amber-950/[0.08] mix-blend-overlay transition-opacity duration-[1200ms] ease-out"
            aria-hidden
          />
          <div
            className="absolute inset-0 backdrop-blur-[2px] transition-opacity duration-[1200ms] ease-out"
            aria-hidden
          />
        </>
      )}
      {/* Answer-received beat */}
      <div
        className={`absolute inset-0 bg-black/15 transition-opacity ease-out ${
          justReceived
            ? "opacity-100 duration-[180ms]"
            : "opacity-0 duration-[520ms]"
        }`}
        aria-hidden
      />
      <div className="oral-grain absolute inset-0 opacity-[0.038]" aria-hidden />
    </div>
  );
}

function JudgmentBlock({
  id,
  value,
  judgment,
  examinerNote,
  align = "centered",
  settled = false,
  teaching = false,
}: {
  id: string;
  value: ScoreValue;
  judgment: string;
  examinerNote: string;
  align?: "centered" | "immersive";
  /**
   * Flips true the moment the examiner begins to speak (segment 1 appears).
   * Relaxes the verdict slightly so the handoff from "deciding" to "speaking"
   * has presence — the word settles back a touch rather than freezing.
   */
  settled?: boolean;
  /** Teaching mode — examiner is demonstrating, not grading. */
  teaching?: boolean;
}) {
  const immersive = align === "immersive";
  const reduceMotion = useReducedMotion();
  const followDelay = judgmentFollowDelayS(reduceMotion, value);

  if (immersive) {
    const headline = teaching ? verdictLine(value, true) : judgment;
    const verdictClass = teaching
      ? "text-white"
      : value <= 1
        ? "text-[#ffbcb0]"
        : value === 2
          ? "text-[#ffe4b0]"
          : "text-[#ecfdf5]";

    const softShadow =
      value <= 1 && !teaching
        ? "0 0 24px rgba(255,120,90,0.2), 0 2px 10px rgba(0,0,0,0.52)"
        : value >= 3 && !teaching
          ? "0 0 32px rgba(52,211,153,0.28), 0 2px 10px rgba(0,0,0,0.42)"
          : value === 2 && !teaching
            ? "0 0 20px rgba(251,191,36,0.14), 0 2px 8px rgba(0,0,0,0.38)"
            : "0 2px 8px rgba(0,0,0,0.35)";

    const verdictEntryDurationS =
      teaching || value >= 3 ? 0.34 : value === 2 ? 0.4 : 0.48;

    return (
      <div className="oral-verdict-record mt-0 flex shrink-0 flex-col items-stretch px-4 py-4 text-left sm:px-6 sm:py-5">
        <motion.p
          className="font-sans text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-amber-100/38"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.36),
            ease: cinematicEase,
          }}
        >
          Oral disposition
        </motion.p>
        <motion.h2
          id={id}
          className={`mt-2 max-w-[min(100%,36rem)] font-serif text-[1.78rem] font-semibold italic leading-[1.16] tracking-[0.02em] transition-all duration-[700ms] ease-out sm:text-[2.05rem] ${verdictClass} ${
            settled && !reduceMotion ? "translate-y-px opacity-[0.95]" : ""
          }`}
          initial={reduceMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: transitionMs(reduceMotion, verdictEntryDurationS),
            ease: [0.2, 0.72, 0.24, 1] as const,
          }}
          style={{ textShadow: softShadow }}
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0">{headline}</span>
          </span>
        </motion.h2>

        {!teaching && examinerNote ? (
          <motion.p
            className="mt-3 max-w-[min(100%,30rem)] text-[0.88rem] font-light leading-[1.72] text-white/88 sm:text-[0.92rem]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: followDelay * 0.35,
              duration: transitionMs(reduceMotion, 0.55),
              ease: cinematicEase,
            }}
          >
            {examinerNote}
          </motion.p>
        ) : null}

        <motion.div
          className="flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: followDelay,
            duration: transitionMs(reduceMotion, 0.55),
            ease: cinematicEase,
          }}
        >
          <div
            className="mt-6 h-px w-full max-w-[min(100%,12rem)] bg-gradient-to-r from-amber-200/25 via-white/10 to-transparent"
            aria-hidden
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center text-center">
      <p className="text-[0.58rem] font-normal uppercase tracking-[0.32em] text-white/[0.22]">
        Examiner record
      </p>

      <h2
        id={id}
        className="mt-2.5 max-w-[99%] font-serif text-[1.5rem] font-semibold leading-[1.1] tracking-[0.01em] text-[#eee6dc] sm:text-[1.7rem]"
      >
        {judgment}
      </h2>

      <div
        className="mx-auto mt-3 h-px w-[min(100%,13rem)] bg-gradient-to-r from-transparent via-[#a08050]/35 to-transparent"
        aria-hidden
      />

      <div className="mt-4 w-full max-w-xl px-3 py-2.5 sm:px-4">
        <p className="text-[0.875rem] font-light italic leading-[1.55] text-[#aea598]/95 sm:text-[0.9rem]">
          {examinerNote}
        </p>
      </div>
    </div>
  );
}

/**
 * Split model answers and standards into short spoken beats — one thought
 * per reveal, not a wall of text.
 */
function splitSpokenChunks(text: string): readonly string[] {
  const t = text.trim();
  if (!t) return [];

  const afterSemicolon = t.split(/\s*;\s+/).map((s) => s.trim()).filter(Boolean);
  const stage1 =
    afterSemicolon.length > 1
      ? afterSemicolon
      : [t];

  const stage2 = stage1.flatMap((block) =>
    block.split(/\s*[—–]\s+/).map((s) => s.trim()).filter(Boolean),
  );

  const out: string[] = [];
  for (const chunk of stage2) {
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...(sentences.length ? sentences : [chunk]));
  }
  return out;
}

/**
 * Frontend-only: break already-split lines a bit shorter for display / reveal
 * pacing. Does not change source copy — only how many motion lines we render.
 * Splits long clauses at ", " when both sides stay substantial.
 */
function refineToShorterLines(
  lines: readonly string[],
  maxLen = 36,
  minClause = 8,
): string[] {
  const result: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length <= maxLen) {
      result.push(line);
      continue;
    }
    const byComma = line.split(/,\s+/).map((s) => s.trim()).filter(Boolean);
    if (
      byComma.length >= 2 &&
      byComma.every((p) => p.length >= minClause)
    ) {
      result.push(...byComma);
      continue;
    }
    result.push(line);
  }
  return result;
}

/**
 * Adds occasional spoken hesitation so delivery feels human.
 * - 3: no hesitation (confident, decisive)
 * - 2: light hesitation (one beat)
 * - 0/1: slightly more hesitation, but still concise
 */
function withThinkingLead(
  line: string,
  index: number,
  score: ScoreValue,
): string {
  const text = line.trim();
  if (!text || index === 0 || score >= 3) return text;
  if (score === 2) {
    return index === 1 ? `... ${text}` : text;
  }
  // score 0/1: add brief pauses on early corrective beats.
  return index <= 2 && index % 2 === 1 ? `... ${text}` : text;
}

function compactSpokenLines(parts: readonly string[]): string[] {
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

type FeedbackLineUnit = { section: string; text: string };

/**
 * Structured examiner notes (not app sections): right / missing / stronger,
 * revealed line-by-line. Checklist bullets stay in the model-answer panel.
 */
function getFeedbackLines(
  evaluation: EvaluationBlock,
  teaching: boolean,
): FeedbackLineUnit[] {
  if (teaching) {
    const body = compactSpokenLines([
      "Here's what I'm listening for.",
      ...refineToShorterLines([
        ...splitSpokenChunks(evaluation.stronger),
        ...splitSpokenChunks(evaluation.why),
      ]),
    ]);
    return body.slice(0, 5).map((text) => ({
      section: "Review",
      text,
    }));
  }

  const rightLabel = "What was right";
  const missLabel = evaluation.score >= 3 ? "Notes" : "What was missing";
  const strongLabel = "A stronger answer would sound like";

  const rightLines: FeedbackLineUnit[] = [];
  const missLines: FeedbackLineUnit[] = [];
  const strongLines: FeedbackLineUnit[] = [];

  const rightSource =
    evaluation.correct.length > 0
      ? evaluation.correct
      : evaluation.score >= 3
        ? []
        : [
            "I didn't hear enough concrete pieces to credit specific checklist items yet.",
          ];

  for (const raw of rightSource) {
    const t = raw.trim();
    if (t) rightLines.push({ section: rightLabel, text: t });
  }

  if (evaluation.score >= 3 && rightLines.length === 0) {
    rightLines.unshift({
      section: rightLabel,
      text: "That meets the standard I was looking for on this item.",
    });
  }

  for (const raw of evaluation.missed) {
    const t = raw.trim();
    if (t) missLines.push({ section: missLabel, text: t });
  }

  for (const raw of refineToShorterLines([
    ...splitSpokenChunks(evaluation.stronger),
  ])) {
    if (raw.trim()) strongLines.push({ section: strongLabel, text: raw.trim() });
  }
  for (const raw of refineToShorterLines([
    ...splitSpokenChunks(evaluation.why),
  ])) {
    if (raw.trim()) strongLines.push({ section: strongLabel, text: raw.trim() });
  }

  const out: FeedbackLineUnit[] = [];
  out.push(...rightLines.slice(0, 1));
  out.push(...missLines.slice(0, 3));
  const room = 5 - out.length;
  out.push(...strongLines.slice(0, Math.max(0, room)));
  return out.slice(0, 5);
}

function buildCorrectAcknowledgment(
  matched: readonly { label: string }[],
  score: ScoreValue,
): readonly string[] {
  if (matched.length === 0) return [];
  const labels = matched
    .map((p) => p.label.trim())
    .filter((s) => s.length > 0);
  if (labels.length === 0) return [];
  if (score >= 3) {
    return [
      `You worked the checklist I needed: ${labels.join(", ")}.`,
    ];
  }
  if (labels.length === 1) {
    return [`What registered: ${labels[0]}.`];
  }
  const lead = labels.slice(0, 2).join(" and ");
  const tail = labels.length > 2 ? ` I also caught ${labels[2]}.` : "";
  return [`What registered: ${lead}.${tail}`];
}

function evaluateAnswer(
  item: OralItem,
  answer: string,
  repeatMissDepth: number = 0,
): EvaluationBlock {
  const rubric = item.rubricPoints;
  const normalized = normalize(answer);
  const matched = rubric.filter((point) =>
    point.keywords.some((keyword) => normalized.includes(normalize(keyword))),
  );
  const missed = rubric.filter((point) => !matched.includes(point));
  const coverage = rubric.length === 0 ? 0 : matched.length / rubric.length;

  const score: ScoreValue =
    matched.length === 0 ? 0 : coverage >= 0.75 ? 3 : coverage >= 0.45 ? 2 : 1;

  const turn = buildExaminerSpokenTurn(item.id, score, missed, {
    repeatMissDepth: repeatMissDepth,
  });
  const spoken = compactSpokenBeats(turn.spokenBeats);
  const correct = buildCorrectAcknowledgment(matched, score);

  return {
    score,
    outcomeLabel: "Examiner assessment",
    judgment: turn.judgment,
    examinerNote: turn.examinerNote,
    correct: [...correct],
    missed: spoken.length > 0 ? spoken : ["Say it again — I'm listening."],
    stronger: item.evaluation.stronger,
    why: item.evaluation.why,
    deeperExplanation: item.evaluation.deeperExplanation,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * End-of-session screen — shown after all questions are done.
 * Lists questions the user flagged for review. Feels like the examiner
 * wrapping up the table session, not a results dashboard.
 */
function SessionEndScreen({
  oralItems,
  markedItems,
  onRetryItem,
  onStartOver,
}: {
  oralItems: readonly OralItem[];
  markedItems: ReadonlySet<string>;
  onRetryItem: (id: string) => void;
  onStartOver: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const marked = oralItems.filter((item) => markedItems.has(item.id));

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.8),
        ease: cinematicEase,
      }}
      className="oral-glass-panel oral-glass-panel--chamber mx-auto w-full max-w-[min(90vw,52rem)] px-8 py-9 sm:px-11 sm:py-10"
    >
      <p className="font-sans text-[0.56rem] font-semibold uppercase tracking-[0.26em] text-amber-100/38">
        Session complete
      </p>
      <h2 className="mt-2 font-serif text-[1.42rem] font-medium italic leading-[1.2] tracking-[0.02em] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.4)] sm:text-[1.52rem]">
        That covers it.
      </h2>
      <p className="mt-4 max-w-[36rem] font-sans text-[0.72rem] font-normal leading-relaxed tracking-[0.02em] text-white/45">
        Save this review for your CFI discussion. This tool builds oral discipline — it does not
        replace the ACS or your examiner.
      </p>

      <div
        className="mt-6 h-px w-full max-w-[min(100%,12rem)] bg-gradient-to-r from-amber-200/20 via-white/10 to-transparent"
        aria-hidden
      />

      {marked.length > 0 ? (
        <div className="mt-8 flex flex-col">
          <p className="text-[0.62rem] font-normal uppercase tracking-[0.26em] text-white/52">
            {marked.length === 1
              ? "1 question set aside"
              : `${marked.length} questions set aside`}
          </p>

          <div className="mt-5 flex flex-col gap-7">
            {marked.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5">
                <p className="text-[0.6rem] font-normal uppercase tracking-[0.26em] text-white/45">
                  {item.contextLabel}
                </p>
                <p className="max-w-[min(100%,30rem)] font-serif text-[0.84rem] font-light italic leading-[1.42] text-white/72 sm:text-[0.88rem]">
                  {`\u201c${item.promptLine}\u201d`}
                </p>
                <button
                  type="button"
                  onClick={() => onRetryItem(item.id)}
                  className={`mt-0.5 self-start ${FOOTER_WHISPER}`}
                >
                  Go again.
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-8 font-serif text-[0.9rem] font-light italic leading-[1.55] text-white/62 sm:text-[0.94rem]">
          Nothing set aside.
        </p>
      )}

      <div className="mt-12 flex flex-col gap-6 border-t border-white/[0.06] pt-8">
        <button
          type="button"
          onClick={onStartOver}
          className={`self-start ${FOOTER_WHISPER}`}
        >
          Start over.
        </button>
        <p className="oral-trust-footnote font-sans">
          Built as a single-purpose oral studio: the clarity of a structured training product, with a
          darker checkride-style presentation — not a course catalog.
        </p>
      </div>
    </motion.div>
  );
}

export function OralEvaluationExperience({
  oralItems,
  loadError = null,
}: {
  oralItems: readonly OralItem[];
  /** Server-side fetch diagnostic when `oralItems` is empty */
  loadError?: string | null;
}) {
  if (oralItems.length === 0) {
    return (
      <div className="fixed inset-0 flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(30,58,95,0.22)_0%,transparent_50%),linear-gradient(180deg,#070a12_0%,#04060c_100%)] px-6">
        <div className="max-w-lg space-y-5 text-center">
          {loadError ? (
            <p className="font-sans text-[0.8rem] font-normal not-italic leading-relaxed tracking-normal text-amber-100/90">
              {loadError}
            </p>
          ) : null}
          <p className="font-serif text-[0.92rem] font-light italic leading-[1.55] text-white/65">
            No oral questions are available. Confirm you are signed in,
            <span className="not-italic text-white/80"> question_sets.slug</span>{" "}
            is{" "}
            <span className="not-italic text-white/80">mvp-orals-v1</span> (or set{" "}
            <span className="not-italic text-white/80">ORAL_QUESTION_SET_SLUG</span>
            ), rows are <span className="not-italic text-white/80">published</span>
            , and questions point at that set — then reload.
          </p>
        </div>
      </div>
    );
  }
  return <OralEvaluationExperienceInner oralItems={oralItems} />;
}
