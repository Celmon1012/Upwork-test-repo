import { AuthNav } from "@/app/components/AuthNav";
import { PracticeEntry } from "@/app/practice/PracticeEntry";
import { getPracticeEntryState } from "@/lib/oral/practiceEntryState";
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

  const entry = await getPracticeEntryState(supabase, user.id);

  return (
    <>
      <AuthNav />
      <PracticeEntry email={user.email ?? ""} entry={entry} />
    </>
  );
}
