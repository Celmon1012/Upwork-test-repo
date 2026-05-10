import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EvaluationBlock,
  OralItem,
  RubricPoint,
  ScoreValue,
} from "@/app/components/oral-evaluation/content";

/** Must match `question_sets.slug` in Supabase (see `supabase/seed.sql`). */
export const DEFAULT_ORAL_QUESTION_SET_SLUG = "mvp-orals-v1";

export type OralCatalogResult = {
  items: OralItem[];
  /**
   * When `items` is empty, explains why (RLS, missing set, query error, etc.).
   * Shown on `/practice/session` so failures are not silent.
   */
  error: string | null;
};

function envQuestionSetSlug(): string {
  const v =
    typeof process.env.ORAL_QUESTION_SET_SLUG === "string"
      ? process.env.ORAL_QUESTION_SET_SLUG.trim()
      : "";
  return v;
}

function slugUsedForLoad(explicit?: string): string {
  return (
    explicit?.trim() ||
    envQuestionSetSlug() ||
    DEFAULT_ORAL_QUESTION_SET_SLUG
  );
}

function asStringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string");
  }
  if (typeof value === "string") {
    try {
      const p: unknown = JSON.parse(value);
      return Array.isArray(p)
        ? p.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

const FALLBACK_EVALUATION: EvaluationBlock = {
  score: 1,
  outcomeLabel: "Examiner assessment",
  judgment: "Walk me through it when you're ready.",
  examinerNote: "I'm listening for structure and decision points.",
  correct: [],
  missed: [],
  stronger:
    "Give a concise, ordered answer that hits each part of the question — assumptions, checks, and a clear decision.",
  why: "The oral is about how you think under the regs, not isolated vocabulary.",
  deeperExplanation: [
    "State what you would verify before flight if anything is unclear.",
    "Brief the sequence the way you would to a DPE across the table.",
  ],
};

function evaluationFromRow(raw: unknown): EvaluationBlock {
  if (!raw || typeof raw !== "object") {
    return { ...FALLBACK_EVALUATION };
  }
  const e = raw as Record<string, unknown>;
  const scoreNum = Number(e.score);
  const score: ScoreValue = [0, 1, 2, 3].includes(scoreNum)
    ? (scoreNum as ScoreValue)
    : FALLBACK_EVALUATION.score;
  const deeper = asStringArray(e.deeperExplanation);
  return {
    score,
    outcomeLabel: String(e.outcomeLabel ?? FALLBACK_EVALUATION.outcomeLabel),
    judgment: String(e.judgment ?? FALLBACK_EVALUATION.judgment),
    examinerNote: String(e.examinerNote ?? FALLBACK_EVALUATION.examinerNote),
    correct: asStringArray(e.correct),
    missed: asStringArray(e.missed),
    stronger: String(e.stronger ?? FALLBACK_EVALUATION.stronger),
    why: String(e.why ?? FALLBACK_EVALUATION.why),
    deeperExplanation:
      deeper.length > 0 ? deeper : [...FALLBACK_EVALUATION.deeperExplanation],
  };
}

function coerceStringArray(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  if (typeof raw === "string") {
    try {
      const p: unknown = JSON.parse(raw);
      return Array.isArray(p)
        ? p.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRubricRows(
  rows: { label: string; keywords: unknown; sort_order: number }[] | null,
): readonly RubricPoint[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const sorted = [...rows].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
  );
  return sorted.map((r) => ({
    label: String(r.label ?? ""),
    keywords: coerceStringArray(r.keywords),
  }));
}

async function findQuestionSetId(
  supabase: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const activeFirst = await supabase
    .from("question_sets")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!activeFirst.error && activeFirst.data?.id) {
    return activeFirst.data.id;
  }
  const anySet = await supabase
    .from("question_sets")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!anySet.error && anySet.data?.id) {
    return anySet.data.id;
  }
  return null;
}

async function resolveQuestionSetId(
  supabase: SupabaseClient,
  explicitSlug?: string,
): Promise<string | null> {
  const slug = slugUsedForLoad(explicitSlug);
  return findQuestionSetId(supabase, slug);
}

type QuestionRow = {
  id: string;
  slug: string;
  context_label: string;
  prompt_line: string | null;
  scenario: string | null;
  sample_answer: unknown;
  order_index: number;
  evaluation?: unknown;
};

/**
 * Loads questions + rubrics (two queries — avoids PostgREST nested `rubrics` failures).
 * Returns `error` when the catalog is empty so the UI can explain RLS / config issues.
 */
export async function loadOralCatalog(
  supabase: SupabaseClient,
  options?: { questionSetSlug?: string },
): Promise<OralCatalogResult> {
  const slug = slugUsedForLoad(options?.questionSetSlug);
  const setId = await resolveQuestionSetId(supabase, options?.questionSetSlug);

  if (!setId) {
    return {
      items: [],
      error: `No question set found for slug "${slug}". In Supabase → Table Editor → question_sets, confirm a row with this exact slug exists and is_active is true (RLS requires a signed-in user).`,
    };
  }

  const includeDraft =
    process.env.ORAL_INCLUDE_DRAFT_QUESTIONS === "1" ||
    process.env.ORAL_INCLUDE_DRAFT_QUESTIONS === "true";

  const SELECT_WITH_EVALUATION =
    "id, slug, context_label, prompt_line, scenario, sample_answer, order_index, evaluation";
  const SELECT_BASE =
    "id, slug, context_label, prompt_line, scenario, sample_answer, order_index";

  async function runQuestionSelect(columns: string) {
    let q = supabase
      .from("questions")
      .select(columns)
      .eq("question_set_id", setId)
      .order("order_index", { ascending: true });
    if (includeDraft) {
      q = q.in("status", ["published", "draft"]);
    } else {
      q = q.eq("status", "published");
    }
    return q;
  }

  let questions: QuestionRow[] | null = null;
  let lastErr: { message: string } | null = null;

  for (const columns of [SELECT_WITH_EVALUATION, SELECT_BASE]) {
    const { data, error } = await runQuestionSelect(columns);
    if (!error && data) {
      questions = data as unknown as QuestionRow[];
      lastErr = null;
      break;
    }
    lastErr = error;
  }

  if (lastErr) {
    return {
      items: [],
      error: `Could not load questions: ${lastErr.message}`,
    };
  }

  if (!questions?.length) {
    return {
      items: [],
      error: `No rows in questions for this set (slug "${slug}"). Use status published (or set ORAL_INCLUDE_DRAFT_QUESTIONS=1) and question_set_id pointing at this set.`,
    };
  }

  const ids = questions.map((q) => q.id).filter(Boolean);
  const rubricByQuestionId = new Map<
    string,
    { label: string; keywords: unknown; sort_order: number }[]
  >();

  if (ids.length > 0) {
    const { data: rubRows, error: rubErr } = await supabase
      .from("rubrics")
      .select("question_id, label, keywords, sort_order")
      .in("question_id", ids);

    if (rubErr) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[loadOralCatalog] rubrics query:", rubErr.message);
      }
    } else if (rubRows) {
      for (const r of rubRows) {
        const qid = r.question_id as string;
        if (!qid) continue;
        const list = rubricByQuestionId.get(qid) ?? [];
        list.push({
          label: String(r.label ?? ""),
          keywords: r.keywords,
          sort_order: Number(r.sort_order) || 0,
        });
        rubricByQuestionId.set(qid, list);
      }
    }
  }

  const out: OralItem[] = [];
  for (const row of questions) {
    if (!row.slug || typeof row.context_label !== "string") {
      continue;
    }
    const sample = asStringArray(row.sample_answer);
    const rubricPoints = mapRubricRows(
      rubricByQuestionId.get(row.id) ?? null,
    );
    const evaluation = evaluationFromRow(row.evaluation);
    out.push({
      questionDbId: row.id,
      id: row.slug,
      contextLabel: row.context_label,
      promptLine: String(row.prompt_line ?? ""),
      scenario: String(row.scenario ?? ""),
      sampleAnswer: sample,
      evaluation,
      rubricPoints,
    });
  }

  if (out.length === 0) {
    return {
      items: [],
      error:
        "Questions were returned but none had a valid slug and context_label.",
    };
  }

  /**
   * Optional: restrict practice to one question slug (e.g. while tuning UX).
   * Omit env var or set `*` for the **full** catalog from this question set.
   */
  const onlySlug =
    typeof process.env.ORAL_PRACTICE_ONLY_SLUG === "string"
      ? process.env.ORAL_PRACTICE_ONLY_SLUG.trim()
      : "";
  if (onlySlug === "" || onlySlug === "*") {
    return { items: out, error: null };
  }
  const locked = out.filter((item) => item.id === onlySlug);
  if (locked.length > 0) {
    return { items: locked, error: null };
  }
  /* Typo or missing slug: still ship full set so practice is usable. */
  return { items: out, error: null };
}

export async function loadPublishedOralItems(
  supabase: SupabaseClient,
  options?: { questionSetSlug?: string },
): Promise<OralItem[]> {
  const { items } = await loadOralCatalog(supabase, options);
  return items;
}
