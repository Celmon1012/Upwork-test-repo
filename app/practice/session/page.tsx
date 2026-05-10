import { AuthNav } from "@/app/components/AuthNav";
import { OralEvaluationExperience } from "@/app/components/oral-evaluation/OralEvaluationExperience";
import { loadOralCatalog } from "@/lib/oral/loadOralItems";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PracticeSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth");
  }

  const { items: allItems, error: loadError } = await loadOralCatalog(supabase);
  const ids = allItems.map((i) => i.questionDbId).filter(Boolean);

  if (params.reset === "1") {
    if (ids.length > 0) {
      await supabase
        .from("progress_snapshots")
        .delete()
        .eq("user_id", user.id)
        .in("question_id", ids);
      await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", user.id)
        .in("question_id", ids);
    }
    redirect("/practice/session");
  }

  let oralItems = allItems;

  if (params.mode === "bookmarks") {
    if (ids.length === 0) {
      oralItems = [];
    } else {
      const { data: bm } = await supabase
        .from("bookmarks")
        .select("question_id")
        .eq("user_id", user.id)
        .in("question_id", ids);

      const allowed = new Set((bm ?? []).map((r) => String(r.question_id)));
      oralItems = allItems.filter((o) => allowed.has(o.questionDbId));
    }
  }

  const bookmarksEmpty =
    params.mode === "bookmarks" && oralItems.length === 0 && ids.length > 0;

  return (
    <>
      <AuthNav />
      <div className="pointer-events-none fixed left-0 top-[4.25rem] z-[55] px-4 sm:left-6 sm:top-[4.5rem]">
        <Link
          href="/practice"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-sans text-[0.72rem] font-medium uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
        >
          ← Practice home
        </Link>
      </div>

      {bookmarksEmpty ? (
        <div className="flex min-h-dvh w-full items-center justify-center bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(255,200,140,0.06)_0%,transparent_55%),linear-gradient(180deg,#070a12_0%,#04060c_100%)] px-6 pb-24 pt-24">
          <div className="max-w-md text-center">
            <p className="font-serif text-[1.05rem] font-light italic leading-relaxed text-white/[0.78]">
              No bookmarked questions yet. During feedback, choose{" "}
              <span className="not-italic text-white/88">Review later</span> to add
              items here.
            </p>
            <Link
              href="/practice"
              className="mt-8 inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-white/24 bg-white/[0.08] px-5 font-sans text-sm font-medium text-white/90 transition hover:border-white/40 hover:bg-white/[0.12]"
            >
              Back to practice home
            </Link>
          </div>
        </div>
      ) : (
        <OralEvaluationExperience oralItems={oralItems} loadError={loadError} />
      )}
    </>
  );
}
