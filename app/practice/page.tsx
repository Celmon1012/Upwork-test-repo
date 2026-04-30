import { AuthNav } from "@/app/components/AuthNav";
import { OralEvaluationExperience } from "@/app/components/oral-evaluation/OralEvaluationExperience";
import { loadOralCatalog } from "@/lib/oral/loadOralItems";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth");
  }

  const { items: oralItems, error: loadError } = await loadOralCatalog(supabase);

  return (
    <>
      <AuthNav />
      <OralEvaluationExperience oralItems={oralItems} loadError={loadError} />
    </>
  );
}
