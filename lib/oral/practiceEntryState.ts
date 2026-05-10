import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOralCatalog } from "@/lib/oral/loadOralItems";

export type PracticeEntryState = {
  questionCount: number;
  bookmarkCount: number;
  canContinue: boolean;
  catalogError: string | null;
  hasCatalog: boolean;
};

/**
 * Server-side summary for `/practice` dashboard (counts + whether resume makes sense).
 */
export async function getPracticeEntryState(
  supabase: SupabaseClient,
  userId: string,
): Promise<PracticeEntryState> {
  const { items, error } = await loadOralCatalog(supabase);
  const questionIds = items.map((i) => i.questionDbId).filter(Boolean);

  let bookmarkCount = 0;
  let canContinue = false;

  if (questionIds.length > 0) {
    const [{ count: bmCount }, snapsRes] = await Promise.all([
      supabase
        .from("bookmarks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("question_id", questionIds),
      supabase
        .from("progress_snapshots")
        .select("payload")
        .eq("user_id", userId)
        .in("question_id", questionIds),
    ]);

    bookmarkCount = bmCount ?? 0;

    const rows = snapsRes.data ?? [];
    canContinue = rows.some((row) => {
      const p = row.payload as { sessionDone?: boolean } | null;
      return p?.sessionDone !== true;
    });
  }

  return {
    questionCount: items.length,
    bookmarkCount,
    canContinue,
    catalogError: error,
    hasCatalog: items.length > 0,
  };
}
