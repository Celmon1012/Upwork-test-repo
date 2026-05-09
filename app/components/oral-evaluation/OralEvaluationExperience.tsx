"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
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
/** Staged debrief: verdict alone → spoken lines → command rail (not one card). */
type FeedbackEvalStage = "judgment" | "speaking" | "actions";

type FeedbackLineUnit = { section: string; text: string };
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

function judgmentDispositionAppearance(score: ScoreValue, teaching: boolean) {
  const verdictClass = teaching
    ? "text-white"
    : score <= 1
      ? "text-[#ffd0c4]"
      : score === 2
        ? "text-[#ffe4b0]"
        : "text-[#ecfdf5]";
  const softShadow =
    score <= 1 && !teaching
      ? "0 0 42px rgba(255,95,70,0.35), 0 0 80px rgba(180,40,30,0.18), 0 3px 18px rgba(0,0,0,0.62)"
      : score >= 3 && !teaching
        ? "0 0 36px rgba(52,211,153,0.32), 0 2px 14px rgba(0,0,0,0.45)"
        : score === 2 && !teaching
          ? "0 0 22px rgba(251,191,36,0.16), 0 2px 10px rgba(0,0,0,0.4)"
          : "0 2px 10px rgba(0,0,0,0.35)";
  const verdictEntryDurationS =
    teaching || score >= 3 ? 0.34 : score === 2 ? 0.4 : 0.56;
  return { verdictClass, softShadow, verdictEntryDurationS };
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
/**
 * After debrief layout appears (recap + disposition), hold before the first
 * spoken feedback line so judgment and evaluation don’t land together.
 */
function debriefSpokenLeadMs(reduce: boolean | null): number {
  if (reduce) return 480;
  return 820 + Math.floor(Math.random() * 520);
}

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
  const base = 760;
  const readRoom = Math.min(900, Math.floor(segmentText.length * 7));
  const jitter = Math.floor(Math.random() * 520);
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
  if (reduce) return 10000;
  const jitter = Math.floor(Math.random() * 1200);
  if (score <= 1) return 13800 + jitter;
  if (score === 2) return 12000 + jitter;
  return 10400 + jitter;
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
  "oral-glass-panel oral-glass-panel--chamber oral-chamber--immersive flex h-[min(92dvh,820px)] w-full max-w-[960px] flex-col overflow-hidden";

/** Same type ramp for full-screen moment + debrief so layoutId does not “snap” styles. */
const ORAL_JUDGMENT_HEADLINE_CLASS =
  "font-serif text-[1.95rem] font-bold italic leading-[1.12] tracking-wide [font-feature-settings:'liga'_1] sm:text-[2.5rem] sm:tracking-[0.04em]";

/** Weak-score verdict: roman weight reads like a stamped ruling, not soft UI copy. */
const ORAL_JUDGMENT_HEADLINE_FAIL_CLASS =
  "font-serif text-[2.12rem] font-extrabold not-italic leading-[1.06] tracking-[0.01em] [font-feature-settings:'liga'_1] sm:text-[2.85rem] sm:tracking-[0.02em]";

/** Subtle tertiary text control */
const FOOTER_WHISPER =
  "rounded-sm border-0 bg-transparent p-0 text-left font-sans text-[0.74rem] font-normal tracking-[0.06em] text-white/40 outline-none transition-[color] duration-200 ease-out hover:text-white/65 focus-visible:text-white/85 focus-visible:ring-1 focus-visible:ring-amber-200/25";

const PRIMARY_RAIL_BTN_DISABLED =
  "disabled:pointer-events-none disabled:opacity-38 disabled:saturate-[0.85]";

/**
 * Premium Interaction Layer — no dock, no toolbar, no frame.
 *
 * Controls emerge from the scene over a soft atmospheric scrim. Secondaries
 * are written in the examiner's voice: serif italic, mid-contrast, no
 * background. Primary is a warm amber small-caps cue with a soft glow —
 * the examiner's gesture, not a website CTA. There is no enclosing box,
 * divider, or border, so the examiner moment stays emotionally dominant.
 */
const ORAL_GHOST_LINK =
  "group inline-flex shrink-0 items-baseline rounded-sm border-0 bg-transparent px-0 py-1.5 font-serif text-[15px] font-light italic leading-none tracking-[0.005em] text-white/[0.66] outline-none transition-[color] duration-300 ease-out hover:text-white/95 focus-visible:text-white focus-visible:ring-1 focus-visible:ring-white/25 active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-30 sm:text-[16px] [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]";

const ORAL_PRIMARY_AMBER =
  `group relative inline-flex shrink-0 items-center gap-[10px] rounded-sm border-0 bg-transparent px-1 py-1.5 font-sans text-[12px] font-semibold uppercase leading-none tracking-[0.34em] text-amber-100 outline-none transition-[color,letter-spacing,text-shadow] duration-300 ease-out hover:tracking-[0.38em] hover:text-amber-50 focus-visible:ring-1 focus-visible:ring-amber-200/40 active:translate-y-px [text-shadow:0_0_24px_rgba(255,219,158,0.30),0_1px_2px_rgba(0,0,0,0.65)] hover:[text-shadow:0_0_36px_rgba(255,219,158,0.50),0_1px_2px_rgba(0,0,0,0.65)] sm:text-[12.5px] sm:tracking-[0.36em] ${PRIMARY_RAIL_BTN_DISABLED}`;

const SUBMIT_ACTION = ORAL_PRIMARY_AMBER;

const PRIMARY_RAIL_BTN = ORAL_PRIMARY_AMBER;

const SECONDARY_RAIL_BTN = ORAL_GHOST_LINK;

// Back-compat aliases so any out-of-band callers continue to compile.
const ORAL_GHOST_BTN = ORAL_GHOST_LINK;
const ORAL_GHOST_PILL = ORAL_GHOST_LINK;
const ORAL_PRIMARY_GLASS = ORAL_PRIMARY_AMBER;
const ORAL_PRIMARY_PILL = ORAL_PRIMARY_AMBER;

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
  const [feedbackEvalStage, setFeedbackEvalStage] =
    useState<FeedbackEvalStage>("judgment");
  const answerRef = useRef<HTMLTextAreaElement>(null);
  /** Anchor at end of examiner transcript — scrollIntoView keeps new lines in view. */
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  /** User scrolled up in debrief — pause following new lines until they return near bottom. */
  const [transcriptFollowPaused, setTranscriptFollowPaused] = useState(false);
  /** Tracks show-answer open so we only auto-scroll once per open, not on every re-render. */
  const wasShowAnswerRef = useRef(false);
  const dialogLabelId = useId();
  const evaluationTimerRef = useRef<number | null>(null);
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const persistenceRef = useRef<PersistenceContext | null>(null);
  const hydratedProgressRef = useRef(false);
  const [resumeReady, setResumeReady] = useState(false);
  /** Best score per item this session (for examiner-style closing; not shown as product UI). */
  const [sessionBestScoreByItemId, setSessionBestScoreByItemId] = useState<
    Record<string, ScoreValue>
  >({});

  const item = oralItems[itemIndex]!;
  const currentAnswerDraft = answerDrafts[item.id] ?? "";
  const evaluation = evaluated ?? item.evaluation;
  const feedbackLines = useMemo(
    () => getFeedbackLines(evaluation, showMeMode),
    [evaluation, showMeMode],
  );
  /** Examiner note speaks first (after judgment), then structured debrief lines — not a labeled report. */
  const spokenFeedbackUnits = useMemo((): FeedbackLineUnit[] => {
    const base = feedbackLines;
    const note =
      !showMeMode && evaluation.examinerNote?.trim()
        ? evaluation.examinerNote.trim()
        : null;
    if (!note) return base;
    return [{ section: "examiner", text: note }, ...base];
  }, [evaluation.examinerNote, feedbackLines, showMeMode]);
  const SEGMENT_FADE_SECONDS = 0.88;
  const segmentDurations = useMemo(
    () => spokenFeedbackUnits.map(() => SEGMENT_FADE_SECONDS),
    [spokenFeedbackUnits],
  );
  const segmentCount = spokenFeedbackUnits.length;
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
      setFeedbackEvalStage("judgment");
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
      setFeedbackEvalStage("judgment");
      setShowThinkingCue(false);
      evaluationTimerRef.current = null;
    }, pauseMs);
  }, [reduceMotion]);

  const advanceFromFeedback = useCallback(() => {
    setSessionBestScoreByItemId((prev) => {
      if (!evaluated || showMeMode) return prev;
      const cur = prev[item.id];
      const next = evaluated.score;
      if (cur != null && next <= cur) return prev;
      return { ...prev, [item.id]: Math.max(cur ?? 0, next) as ScoreValue };
    });
    setSessionPhase("respond");
    setAnswerError(null);
    setEvaluated(null);
    setShowMeMode(false);
    setShowAnswer(false);
    setFeedbackRailReady(false);
    setAnswerRevealChromeHidden(false);
    setRevealedSegments(0);
    setFeedbackEvalStage("judgment");
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
  }, [
    evaluated,
    fromReview,
    item.id,
    itemIndex,
    oralItems.length,
    showMeMode,
  ]);

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
    setFeedbackEvalStage("judgment");
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
    setFeedbackEvalStage("judgment");
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
    setFeedbackEvalStage("judgment");
    setShowTransitionCue(false);
    setShowThinkingCue(false);
    setJustReceived(false);
    setOralRepeatMissCount(0);
    setAnswerDrafts({});
    setSessionBestScoreByItemId({});
  }, [questionDbIdSet]);

  const openReviewLaterList = useCallback(() => {
    setSessionDone(true);
    setFromReview(false);
  }, []);

  const evaluating = sessionPhase === "evaluating";
  const showQuestionChrome =
    sessionPhase === "respond" || sessionPhase === "evaluating";
  const judgmentHeadline = showMeMode
    ? verdictLine(evaluation.score, true)
    : evaluation.judgment;
  const judgmentDisposition = useMemo(
    () => judgmentDispositionAppearance(evaluation.score, showMeMode),
    [evaluation.score, showMeMode],
  );
  const judgmentHeadlineTypography = useMemo(() => {
    if (showMeMode) return ORAL_JUDGMENT_HEADLINE_CLASS;
    if (evaluation.score <= 1) return ORAL_JUDGMENT_HEADLINE_FAIL_CLASS;
    return ORAL_JUDGMENT_HEADLINE_CLASS;
  }, [evaluation.score, showMeMode]);

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
      setTranscriptFollowPaused(false);
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

  /** Only scroll the debrief pane — never scrollIntoView (avoids parent/window fighting & yo-yo). */
  const scrollDebriefToBottom = useCallback(() => {
    const sc = transcriptScrollRef.current;
    if (!sc) return;
    sc.scrollTo({
      top: sc.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion]);

  /** Follow examiner transcript as lines reveal — respects manual scroll-up. */
  useEffect(() => {
    if (
      sessionPhase !== "feedback" ||
      transcriptFollowPaused ||
      feedbackEvalStage === "judgment"
    )
      return;
    const id = window.requestAnimationFrame(() => {
      scrollDebriefToBottom();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    allSegmentsRevealed,
    spokenFeedbackUnits.length,
    item.id,
    reduceMotion,
    revealedSegments,
    sessionPhase,
    feedbackRailReady,
    transcriptFollowPaused,
    feedbackEvalStage,
    scrollDebriefToBottom,
  ]);

  /** When debrief completes, nudge bottom once — only if user hasn’t scrolled away. */
  useEffect(() => {
    if (
      sessionPhase !== "feedback" ||
      !allSegmentsRevealed ||
      feedbackEvalStage === "judgment" ||
      transcriptFollowPaused
    )
      return;
    const ms = reduceMotion ? 80 : 340;
    const id = window.setTimeout(() => {
      scrollDebriefToBottom();
    }, ms);
    return () => window.clearTimeout(id);
  }, [
    allSegmentsRevealed,
    feedbackEvalStage,
    feedbackRailReady,
    item.id,
    reduceMotion,
    sessionPhase,
    transcriptFollowPaused,
    scrollDebriefToBottom,
  ]);

  /**
   * Show / Hide model answer: track height during the AnimatePresence transition so the
   * inline command rail keeps its position at the bottom of the viewport. The rail is in
   * flow now, so this prevents an apparent “jump up” when the model block collapses.
   */
  useEffect(() => {
    if (
      sessionPhase !== "feedback" ||
      feedbackEvalStage === "judgment" ||
      showMeMode
    ) {
      wasShowAnswerRef.current = showAnswer;
      return;
    }
    if (wasShowAnswerRef.current === showAnswer) return;
    wasShowAnswerRef.current = showAnswer;

    scrollDebriefToBottom();
    const stops = reduceMotion ? [60] : [80, 220, 380, 560];
    const handles = stops.map((ms) =>
      window.setTimeout(scrollDebriefToBottom, ms),
    );
    return () => handles.forEach((h) => window.clearTimeout(h));
  }, [
    showAnswer,
    sessionPhase,
    feedbackEvalStage,
    showMeMode,
    reduceMotion,
    scrollDebriefToBottom,
  ]);

  // Keyboard Enter follows the explicit Continue action in Phase 2.
  const primaryAfterFeedback = useCallback(() => {
    advanceFromFeedback();
  }, [advanceFromFeedback]);

  const continueFeedbackEnabled =
    feedbackRailReady && !(showAnswer && answerRevealChromeHidden);

  useEffect(() => {
    if (
      sessionPhase !== "feedback" ||
      feedbackEvalStage !== "actions" ||
      !allSegmentsRevealed ||
      !continueFeedbackEnabled
    )
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
    feedbackEvalStage,
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

  /** Verdict-only beat: nothing else on screen until this advances to "speaking". */
  useEffect(() => {
    if (sessionPhase !== "feedback" || feedbackEvalStage !== "judgment") return;
    const weakHold =
      !showMeMode && evaluation.score <= 1
        ? 420 + Math.floor(Math.random() * 380)
        : 0;
    const ms = reduceMotion
      ? 850 + (weakHold ? 120 : 0)
      : 2400 + weakHold + Math.floor(Math.random() * 1000);
    const id = window.setTimeout(() => {
      setRevealedSegments(0);
      setFeedbackEvalStage("speaking");
    }, ms);
    return () => window.clearTimeout(id);
  }, [
    sessionPhase,
    feedbackEvalStage,
    item.id,
    reduceMotion,
    evaluation.score,
    showMeMode,
  ]);

  useEffect(() => {
    if (sessionPhase !== "feedback" || feedbackEvalStage !== "speaking") return;
    if (spokenFeedbackUnits.length > 0) return;
    const ms = reduceMotion ? 220 : debriefSpokenLeadMs(reduceMotion) + 200;
    const id = window.setTimeout(() => setFeedbackEvalStage("actions"), ms);
    return () => window.clearTimeout(id);
  }, [
    sessionPhase,
    feedbackEvalStage,
    spokenFeedbackUnits.length,
    reduceMotion,
  ]);

  useEffect(() => {
    if (sessionPhase !== "feedback" || feedbackEvalStage !== "speaking") return;
    if (!allSegmentsRevealed || !feedbackRailReady) return;
    if (showAnswer && answerRevealChromeHidden) return;
    const ms = reduceMotion ? 120 : 480;
    const id = window.setTimeout(() => setFeedbackEvalStage("actions"), ms);
    return () => window.clearTimeout(id);
  }, [
    allSegmentsRevealed,
    answerRevealChromeHidden,
    feedbackEvalStage,
    feedbackRailReady,
    reduceMotion,
    sessionPhase,
    showAnswer,
  ]);

  /** Spoken debrief lines — only after judgment moment; no verdict-solo padding here. */
  useEffect(() => {
    if (sessionPhase !== "feedback" || feedbackEvalStage !== "speaking") return;
    if (spokenFeedbackUnits.length === 0) return;

    const timers: number[] = [];
    let cumulative = debriefSpokenLeadMs(reduceMotion);
    for (let i = 0; i < spokenFeedbackUnits.length; i++) {
      const index = i;
      timers.push(
        window.setTimeout(() => {
          setRevealedSegments(index + 1);
        }, cumulative),
      );
      if (i < spokenFeedbackUnits.length - 1) {
        let gap = segmentRevealDelayMs(spokenFeedbackUnits[i]!.text, reduceMotion);
        if (
          i === 0 &&
          evaluation.score < 3 &&
          !showMeMode &&
          spokenFeedbackUnits.length > 1
        ) {
          gap += 200 + Math.floor(Math.random() * 280);
        }
        if (
          i === spokenFeedbackUnits.length - 2 &&
          evaluation.score < 3 &&
          !showMeMode
        ) {
          gap += 380 + Math.floor(Math.random() * 420);
        }
        cumulative += gap;
      }
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [
    evaluation.score,
    feedbackEvalStage,
    reduceMotion,
    sessionPhase,
    showMeMode,
    spokenFeedbackUnits,
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
              sessionBestScoreByItemId={sessionBestScoreByItemId}
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
      {sessionPhase === "evaluating" ? (
        <span className="sr-only" aria-live="polite">
          Please wait.
        </span>
      ) : null}
      <p className="sr-only">
        Training simulation — supplements ACS preparation; not an FAA examination or endorsement.
      </p>

      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div
          className={`relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6 sm:px-12 sm:py-8 ${
            sessionPhase === "feedback"
              ? ""
              : "items-center justify-center overflow-x-hidden overflow-y-visible"
          }`}
        >
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
              className={`relative mx-auto flex min-h-0 w-full flex-col ${
                sessionPhase === "feedback"
                  ? "max-w-full flex-1"
                  : "max-w-[min(96vw,960px)]"
              }`}
            >
              {sessionPhase === "feedback" ? (
                <LayoutGroup id={`oral-feedback-${item.id}`}>
                  <>
                  <AnimatePresence initial={false}>
                    {feedbackEvalStage === "judgment" ? (
                      <JudgmentBackdrop
                        key={`jb-${item.id}`}
                        reduceMotion={reduceMotion}
                        score={evaluation.score}
                        teaching={showMeMode}
                      />
                    ) : null}
                  </AnimatePresence>

                  <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                    {feedbackEvalStage !== "judgment" ? (
                      <header className="shrink-0 border-b border-white/[0.05] px-5 pb-2.5 pt-4 sm:px-10 sm:pb-3 sm:pt-5">
                        <div className="mx-auto w-full max-w-[min(96vw,960px)]">
                          <p className="max-w-[min(40rem,92vw)] font-serif text-[0.78rem] font-normal leading-snug tracking-[0.02em] text-white/[0.62] sm:text-[0.82rem]">
                            {item.contextLabel}
                          </p>
                          <div
                            className="mt-2.5 h-px w-10 bg-gradient-to-r from-amber-200/25 to-transparent"
                            aria-hidden
                          />
                        </div>
                      </header>
                    ) : null}

                    <span className="sr-only">{item.contextLabel}</span>

                    {/*
                      Match header rhythm: horizontal padding on the outer edge, max-width column
                      centered inside — same left edge as “ORAL EVALUATION”, not a nested narrow column.
                    */}
                    <div
                      className={`flex min-h-0 flex-1 flex-col px-5 sm:px-10 ${
                        feedbackEvalStage === "judgment"
                          ? ""
                          : feedbackEvalStage === "actions"
                            ? "pt-6 pb-[150px] sm:pt-8 sm:pb-[170px]"
                            : "pt-6 sm:pt-8"
                      }`}
                    >
                      <div
                        ref={transcriptScrollRef}
                        onScroll={onTranscriptScroll}
                        className={`oral-scrollbar-modern relative z-[1] mx-auto flex min-h-0 w-full max-w-[min(96vw,960px)] flex-1 flex-col overflow-x-hidden ${
                          feedbackEvalStage === "judgment"
                            ? "overflow-hidden py-0"
                            : "overflow-y-auto pr-3 sm:pr-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                        }`}
                        role="log"
                        aria-live="polite"
                        aria-relevant="additions"
                        aria-label="Examiner feedback"
                      >
                      {feedbackEvalStage !== "judgment" ? (
                        <div className="w-full min-w-0">
                          <p className="font-serif text-[0.92rem] font-light leading-snug tracking-[0.02em] text-white/[0.68] sm:text-[0.96rem]">
                            {item.promptLine}
                          </p>
                        </div>
                      ) : null}

                      <motion.h2
                        layout={!reduceMotion}
                        id={dialogLabelId}
                        role={feedbackEvalStage === "judgment" ? "status" : undefined}
                        aria-live={
                          feedbackEvalStage === "judgment" ? "assertive" : undefined
                        }
                        aria-atomic={feedbackEvalStage === "judgment" ? true : undefined}
                        className={`${judgmentHeadlineTypography} ${judgmentDisposition.verdictClass} ${
                          feedbackEvalStage === "judgment"
                            ? "pointer-events-none fixed left-[50%] top-[50%] z-[51] w-[min(92vw,40rem)] max-w-[40rem] -translate-x-1/2 -translate-y-1/2 px-4 text-center"
                            : "relative z-10 mt-8 w-full min-w-0 border-t border-white/[0.08] pt-8 text-left"
                        }`}
                        style={{ textShadow: judgmentDisposition.softShadow }}
                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          layout: reduceMotion
                            ? undefined
                            : {
                                type: "spring",
                                stiffness: 300,
                                damping: 38,
                                mass: 0.88,
                              },
                          opacity: {
                            duration: transitionMs(reduceMotion, 0.42),
                            ease: cinematicEase,
                          },
                          y: {
                            duration: transitionMs(reduceMotion, 0.42),
                            ease: cinematicEase,
                          },
                        }}
                      >
                        {feedbackEvalStage === "judgment" ? (
                          <span className="sr-only">
                            {showMeMode ? "Model reference." : "Examiner judgment."}
                          </span>
                        ) : null}
                        {judgmentHeadline}
                      </motion.h2>

                      {feedbackEvalStage !== "judgment" ? (
                        <>
                          <div className="mt-10 w-full min-w-0">
                            {spokenFeedbackUnits.map((unit, index) => {
                              if (index >= revealedSegments) return null;
                              const duration = segmentDurations[index] ?? 0.88;
                              const paraRhythm =
                                index === 0
                                  ? "mt-0"
                                  : (index + evaluation.score) % 3 === 0
                                    ? "mt-7 sm:mt-8"
                                    : (index + evaluation.score) % 3 === 1
                                      ? "mt-5 sm:mt-6"
                                      : "mt-6 sm:mt-7";
                              return (
                                <motion.p
                                  key={`${item.id}-fb-${index}`}
                                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
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
                                    times: reduceMotion ? undefined : [0, 0.15, 0.32, 1],
                                    ease: cinematicEase,
                                  }}
                                  className={`max-w-[min(40rem,92vw)] font-serif text-[0.98rem] font-normal leading-[1.72] tracking-[0.004em] text-white/[0.9] sm:text-[1.05rem] sm:leading-[1.76] ${paraRhythm}`}
                                >
                                  {withThinkingLead(unit.text, index, evaluation.score)}
                                </motion.p>
                              );
                            })}
                          </div>

                          <AnimatePresence initial={false}>
                            {allSegmentsRevealed && showAnswer && !showMeMode ? (
                              <motion.div
                                key="answer-reveal"
                                className="mt-10 w-full min-w-0 border-t border-white/[0.08] pt-8"
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
                                  className="font-serif text-[0.72rem] font-normal tracking-[0.02em] text-white/38"
                                >
                                  Reference answer
                                </motion.p>
                                {sampleAnswerLines.map((line, lineIdx) => (
                                  <motion.p
                                    key={`${item.id}-sample-${lineIdx}`}
                                    initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                      duration: transitionMs(reduceMotion, 0.55),
                                      delay: reduceMotion ? 0 : 0.12 + lineIdx * 0.22,
                                      ease: cinematicEase,
                                    }}
                                    className={`font-serif text-[0.92rem] font-light leading-[1.82] tracking-[0.01em] text-white/[0.88] sm:text-[0.96rem] ${
                                      lineIdx === 0 ? "mt-3" : "mt-2"
                                    }`}
                                  >
                                    {line}
                                  </motion.p>
                                ))}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </>
                      ) : null}

                      <div
                        ref={transcriptEndRef}
                        className="h-4 shrink-0 scroll-mt-6"
                        aria-hidden
                      />
                      </div>
                    </div>
                  </div>
                  </>
                </LayoutGroup>
              ) : (
                <div
                  className={`${ORAL_PANEL_SHELL} transition-[box-shadow,ring-color] duration-700 ease-out ${
                    evaluating
                      ? "ring-1 ring-amber-200/[0.14] shadow-[0_40px_120px_rgba(0,0,0,0.88)]"
                      : "ring-1 ring-white/[0.05] shadow-[0_32px_100px_rgba(0,0,0,0.72)]"
                  }`}
                >
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <header className="shrink-0 border-b border-white/[0.05] px-8 pb-3 pt-5 sm:px-11 sm:pb-3.5 sm:pt-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className="mt-1 h-7 w-px shrink-0 bg-gradient-to-b from-amber-200/35 to-transparent"
                          aria-hidden
                        />
                        <p className="min-w-0 max-w-[min(40rem,92vw)] font-serif text-[0.78rem] font-normal leading-snug tracking-[0.02em] text-white/[0.62] sm:text-[0.82rem]">
                          {item.contextLabel}
                        </p>
                      </div>
                    </header>

                    <AnimatePresence mode="wait" initial={false}>
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
                        <span className="sr-only">Examiner question</span>
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
                        <label
                          htmlFor="oral-answer"
                          className="mb-2 block font-serif text-[0.72rem] font-normal tracking-[0.02em] text-white/35"
                        >
                          Your answer
                        </label>
                        <div
                          className={`oral-input-wrap relative min-h-[13rem] flex-1 min-w-0 overflow-hidden rounded-sm border border-white/[0.06] bg-black/20 transition-[opacity,filter] duration-500 ease-out sm:min-h-[16rem] ${
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

                    <div className="relative shrink-0 px-3 pt-6 pb-3 sm:px-5 sm:pt-7 sm:pb-3.5">
                      <span className="sr-only" role="status" aria-live="polite">
                        {evaluating ? "Examiner is evaluating." : ""}
                      </span>
                      {evaluating && showThinkingCue ? (
                        <p className="font-serif text-[0.85rem] font-light italic text-white/45 sm:text-[0.92rem]">
                          One moment.
                        </p>
                      ) : !evaluating ? (
                        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-12">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-7 gap-y-2 sm:gap-x-9">
                            <button
                              type="button"
                              onClick={runShowMe}
                              className={ORAL_GHOST_LINK}
                            >
                              Show me the answer
                            </button>
                            {markedItems.size > 0 ? (
                              <button
                                type="button"
                                onClick={openReviewLaterList}
                                className={ORAL_GHOST_LINK}
                              >
                                Review later ({markedItems.size})
                              </button>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={runEvaluation}
                              className={ORAL_PRIMARY_AMBER}
                              aria-label="Submit answer for evaluation"
                            >
                              <span>Submit</span>
                              <ArrowRight
                                className="size-[14px] shrink-0 opacity-95 group-hover:translate-x-[1px] transition-transform duration-300 ease-out"
                                strokeWidth={1.8}
                                aria-hidden
                              />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {sessionPhase === "feedback" && feedbackEvalStage === "actions" ? (
          <EvaluationActionStrip
            key="fb-actions-fixed"
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
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * EvaluationActionStrip — Glass Cockpit Strip (feedback phase).
 *
 * Fixed bottom, centered max-width. Appears only when `feedbackEvalStage ===
 * "actions"` after debrief completes; motion wrapper uses ~400ms delay,
 * fade + slight rise. See ORAL_GHOST_LINK / ORAL_PRIMARY_AMBER.
 */
function EvaluationActionStrip({
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 sm:px-8"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.6),
        delay: reduceMotion ? 0 : 0.4,
        ease: cinematicEase,
      }}
    >
      {/*
        Atmospheric scrim — controls emerge from the cinematic scene rather
        than sit inside a dock. Tall gradient pulls the page atmosphere
        downward so the controls feel embedded, not stamped on top.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] h-[280px] sm:h-[320px] bg-gradient-to-t from-[#04060c] via-[#04060c]/72 to-transparent"
      />

      <div className="pointer-events-auto relative mx-auto flex w-full max-w-[min(92vw,820px)] flex-col gap-3 pb-[calc(max(env(safe-area-inset-bottom),20px)+72px)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-12 sm:pb-[calc(1.75rem+72px)]">
        {/* Secondary actions — examiner's quiet offer of options */}
        <motion.div
          className="flex min-w-0 flex-wrap items-baseline gap-x-7 gap-y-2 sm:gap-x-9"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.65),
            delay: reduceMotion ? 0 : 0.45,
            ease: cinematicEase,
          }}
        >
          <button
            type="button"
            onClick={onTryAgain}
            disabled={!secondaryUnlocked}
            className={ORAL_GHOST_LINK}
          >
            Try again
          </button>
          {!teaching ? (
            <button
              type="button"
              onClick={onToggleAnswer}
              disabled={!secondaryUnlocked}
              className={ORAL_GHOST_LINK}
            >
              {showAnswer ? "Hide the answer" : "Show me the answer"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReviewLater}
            disabled={!secondaryUnlocked}
            className={ORAL_GHOST_LINK}
          >
            Review later
          </button>
        </motion.div>

        {/* Primary cue — examiner's gesture forward, not a CTA */}
        <motion.div
          className="flex shrink-0 items-center self-end sm:self-auto"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.7),
            delay: reduceMotion ? 0 : 0.62,
            ease: cinematicEase,
          }}
        >
          {!continueEnabled ? (
            <span className="sr-only">Waiting for debrief to finish.</span>
          ) : null}
          <button
            type="button"
            onClick={onNextQuestion}
            disabled={!continueEnabled}
            className={ORAL_PRIMARY_AMBER}
            aria-label="Continue to next item"
          >
            <span>Continue</span>
            <ArrowRight
              className="size-[14px] shrink-0 opacity-95 group-hover:translate-x-[1px] group-disabled:translate-x-0 transition-transform duration-300 ease-out"
              strokeWidth={1.8}
              aria-hidden
            />
          </button>
        </motion.div>
      </div>
      {!teaching ? (
        <p className="sr-only">
          Score {score} of 3. {scoreMeaning}
        </p>
      ) : null}
    </motion.div>
  );
}

/**
 * Dims the viewport during the judgment-only beat.
 * The disposition line stays mounted in the transcript column (fixed → in-flow) so it never unmounts.
 */
function JudgmentBackdrop({
  reduceMotion,
  score,
  teaching,
}: {
  reduceMotion: boolean | null;
  score: ScoreValue;
  teaching: boolean;
}) {
  const inner =
    teaching || score >= 3
      ? { a: 0.3, b: 0.88 }
      : score === 2
        ? { a: 0.34, b: 0.93 }
        : { a: 0.44, b: 0.99 };
  const background = `radial-gradient(ellipse 66%_56%_at_50%_42%, rgba(0,0,0,${inner.a}) 0%, rgba(4,6,14,${inner.b}) 100%)`;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{ background }}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.48),
        ease: cinematicEase,
      }}
    />
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
              ? "scale-[1.028] brightness-[0.56] saturate-[0.88]"
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
        ? "text-[#ffd0c4]"
        : value === 2
          ? "text-[#ffe4b0]"
          : "text-[#ecfdf5]";

    const softShadow =
      value <= 1 && !teaching
        ? "0 0 40px rgba(255,95,70,0.32), 0 0 72px rgba(180,40,30,0.16), 0 3px 16px rgba(0,0,0,0.58)"
        : value >= 3 && !teaching
          ? "0 0 32px rgba(52,211,153,0.28), 0 2px 10px rgba(0,0,0,0.42)"
          : value === 2 && !teaching
            ? "0 0 20px rgba(251,191,36,0.14), 0 2px 8px rgba(0,0,0,0.38)"
            : "0 2px 8px rgba(0,0,0,0.35)";

    const verdictEntryDurationS =
      teaching || value >= 3 ? 0.34 : value === 2 ? 0.4 : 0.56;

    return (
      <div className="oral-verdict-record mt-0 flex shrink-0 flex-col items-stretch px-4 py-4 text-left sm:px-6 sm:py-5">
        <motion.p
          className={`font-serif text-[0.66rem] font-semibold not-italic sm:text-[0.7rem] ${
            teaching
              ? "uppercase tracking-[0.22em] text-amber-100/38"
              : value <= 1
                ? "tracking-[0.14em] text-amber-100/[0.72]"
                : "tracking-[0.12em] text-amber-100/[0.65]"
          }`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: transitionMs(reduceMotion, 0.36),
            ease: cinematicEase,
          }}
        >
          {teaching ? "Model track" : "Examiner disposition"}
        </motion.p>
        <motion.h2
          id={id}
          className={`mt-2 max-w-[min(100%,36rem)] font-serif transition-all duration-[700ms] ease-out ${
            !teaching && value <= 1
              ? "text-[1.95rem] font-extrabold not-italic leading-[1.08] tracking-[0.01em] sm:text-[2.55rem] sm:tracking-[0.02em]"
              : "text-[1.78rem] font-semibold italic leading-[1.16] tracking-[0.02em] sm:text-[2.05rem]"
          } ${verdictClass} ${
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
  maxLen = 52,
  minClause = 12,
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

/** Stable-ish mix per line so bridges vary without feeling random frame-to-frame. */
function oralLeadMix(index: number, score: ScoreValue, text: string): number {
  let h = index * 47 + score * 13;
  const cap = Math.min(text.length, 28);
  for (let i = 0; i < cap; i++) {
    h = (h + text.charCodeAt(i) * (i + 3)) % 1009;
  }
  return h;
}

/**
 * Light oral framing — varied bridges, sometimes none (sounds like a person, not a template).
 */
function withThinkingLead(
  line: string,
  index: number,
  score: ScoreValue,
): string {
  const text = line.trim();
  if (!text) return text;
  if (index === 0) return text;

  const mix = oralLeadMix(index, score, text);

  if (score >= 3) {
    if (index === 1 && !/^so[\s,—-]/i.test(text)) {
      const passBridge = [
        (t: string) => `So — ${t}`,
        (t: string) => `Okay — ${t}`,
        (t: string) => `All right — ${t}`,
        (t: string) => t,
      ];
      return passBridge[mix % passBridge.length]!(text);
    }
    return text;
  }

  if (score === 2) {
    if (index === 1) {
      const adeqBridge = [
        (t: string) => `Here's the gap — ${t}`,
        (t: string) => `Where I'm stuck — ${t}`,
        (t: string) => `The piece I still need — ${t}`,
        (t: string) => t,
      ];
      return adeqBridge[mix % adeqBridge.length]!(text);
    }
    return text;
  }

  if (index === 1) {
    const weakBridge = [
      (t: string) => `Look — ${t}`,
      (t: string) => `Listen — ${t}`,
      (t: string) => `For me — ${t}`,
      (t: string) => t,
    ];
    return weakBridge[mix % weakBridge.length]!(text);
  }
  if (index === 3) {
    const closeBridge = [
      (t: string) => t,
      (t: string) => t,
      (t: string) => t,
      (t: string) => `Bottom line: ${t}`,
    ];
    return closeBridge[mix % closeBridge.length]!(text);
  }
  return text;
}

function compactSpokenLines(parts: readonly string[]): string[] {
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

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
      "So — here's what I'm listening for.",
      ...refineToShorterLines([
        ...splitSpokenChunks(evaluation.stronger),
        ...splitSpokenChunks(evaluation.why),
      ]),
    ]);
    return body.slice(0, 4).map((text) => ({
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
            "I didn't get enough concrete pieces to hang a grade on.",
          ];

  for (const raw of rightSource) {
    const t = raw.trim();
    if (t) rightLines.push({ section: rightLabel, text: t });
  }

  if (evaluation.score >= 3 && rightLines.length === 0) {
    rightLines.unshift({
      section: rightLabel,
      text: "That hits what I was looking for on this one.",
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

  const maxOut = evaluation.score >= 3 ? 4 : 5;
  const missCap = evaluation.score >= 3 ? 2 : 4;
  const strongCap = evaluation.score >= 3 ? 2 : 2;
  const out: FeedbackLineUnit[] = [];
  out.push(...rightLines.slice(0, 1));
  out.push(...missLines.slice(0, missCap));
  const room = maxOut - out.length;
  out.push(...strongLines.slice(0, Math.min(strongCap, Math.max(0, room))));
  return out.slice(0, maxOut);
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
    if (labels.length === 1) return [`I heard ${labels[0]} — good.`];
    return [`I heard ${labels.slice(0, 2).join(" and ")}.`];
  }
  if (labels.length === 1) {
    return [`I caught ${labels[0]}.`];
  }
  const lead = labels.slice(0, 2).join(" and ");
  return [`I caught ${lead}.`];
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
    missed: spoken.length > 0 ? spoken : ["Say it again. I'm listening."],
    stronger: item.evaluation.stronger,
    why: item.evaluation.why,
    deeperExplanation: item.evaluation.deeperExplanation,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildSessionClosingDisposition(
  oralItems: readonly OralItem[],
  sessionBestScoreByItemId: Readonly<Record<string, ScoreValue>>,
): {
  headline: string;
  disposition: string;
  readiness: string;
  reviewAreas: string[];
} {
  const scores = oralItems.map((o) => sessionBestScoreByItemId[o.id] ?? 0);
  const min = scores.length ? Math.min(...scores) : 0;
  const weak = oralItems.filter((o) => (sessionBestScoreByItemId[o.id] ?? 0) < 3);
  const reviewAreas = weak.map((o) => o.contextLabel);
  const recorded = scores.filter((s) => s > 0).length;

  let headline: string;
  let disposition: string;
  let readiness: string;

  if (recorded === 0) {
    headline = "We're done here.";
    disposition = "I don't have a graded pass on record from this room.";
    readiness = "Run it again when you're ready to answer under pressure.";
  } else if (min <= 1) {
    headline = "Closing the oral.";
    disposition = "Not at checkride standard yet — not on what I heard today.";
    readiness =
      "I'm not comfortable signing this off yet. You need another pass on this scenario.";
  } else if (min === 2) {
    headline = "That's enough for now.";
    disposition = "Acceptable direction, but incomplete.";
    readiness =
      "Your decision-making is improving, but I'm not ready to call this ready off one sitting.";
  } else {
    headline = "We're finished.";
    disposition =
      "Stronger on the items you cleared — I'd still want another scenario before calling this ready.";
    readiness =
      "That response is closer. I don't hand out readiness off one clean pass.";
  }

  if (oralItems.length === 1 && min >= 3) {
    disposition =
      "That meets the standard on this item — repetition under pressure still matters.";
    readiness = "I'd want another scenario before I call you ready.";
  }

  return { headline, disposition, readiness, reviewAreas };
}

/**
 * End-of-session — examiner disposition and table close, not module complete.
 */
function SessionEndScreen({
  oralItems,
  markedItems,
  sessionBestScoreByItemId,
  onRetryItem,
  onStartOver,
}: {
  oralItems: readonly OralItem[];
  markedItems: ReadonlySet<string>;
  sessionBestScoreByItemId: Readonly<Record<string, ScoreValue>>;
  onRetryItem: (id: string) => void;
  onStartOver: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const marked = oralItems.filter((item) => markedItems.has(item.id));
  const closing = buildSessionClosingDisposition(
    oralItems,
    sessionBestScoreByItemId,
  );

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: transitionMs(reduceMotion, 0.8),
        ease: cinematicEase,
      }}
      className="oral-glass-panel oral-glass-panel--chamber oral-chamber--immersive mx-auto w-full max-w-[min(90vw,52rem)] px-8 py-9 sm:px-11 sm:py-10"
    >
      <h2 className="font-serif text-[1.38rem] font-medium italic leading-[1.22] tracking-[0.02em] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.4)] sm:text-[1.5rem]">
        {closing.headline}
      </h2>
      <p className="mt-4 max-w-[36rem] font-serif text-[0.95rem] font-normal leading-[1.55] tracking-[0.02em] text-white/[0.78] sm:text-[1rem]">
        {closing.disposition}
      </p>
      <p className="mt-3 max-w-[36rem] font-serif text-[0.88rem] font-light italic leading-[1.52] text-white/55 sm:text-[0.92rem]">
        {closing.readiness}
      </p>

      {closing.reviewAreas.length > 0 ? (
        <div className="mt-7">
          <p className="font-serif text-[0.72rem] font-normal tracking-[0.02em] text-white/38">
            Areas I&apos;d want to see again
          </p>
          <ul className="mt-2.5 list-none space-y-1.5 pl-0">
            {closing.reviewAreas.map((label) => (
              <li
                key={label}
                className="font-serif text-[0.84rem] font-light leading-snug text-white/[0.62]"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className="mt-8 h-px w-full max-w-[min(100%,14rem)] bg-gradient-to-r from-amber-200/18 via-white/8 to-transparent"
        aria-hidden
      />

      {marked.length > 0 ? (
        <div className="mt-8 flex flex-col">
          <p className="font-serif text-[0.72rem] font-normal tracking-[0.02em] text-white/40">
            {marked.length === 1
              ? "You flagged one item to revisit"
              : `You flagged ${marked.length} items to revisit`}
          </p>

          <div className="mt-4 flex flex-col gap-6">
            {marked.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <p className="font-serif text-[0.78rem] text-white/[0.55]">
                  {item.contextLabel}
                </p>
                <p className="max-w-[min(100%,30rem)] font-serif text-[0.82rem] font-light italic leading-[1.42] text-white/68 sm:text-[0.86rem]">
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
      ) : null}

      <div className="mt-10 flex flex-col gap-5 border-t border-white/[0.06] pt-7">
        <button
          type="button"
          onClick={onStartOver}
          className={`self-start ${FOOTER_WHISPER}`}
        >
          Start over.
        </button>
        <p className="oral-trust-footnote font-sans">
          Training simulation — not an FAA examination. Discuss with your CFI against the ACS.
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
