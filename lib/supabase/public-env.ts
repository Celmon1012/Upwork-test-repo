/**
 * Read Supabase public env in one place.
 * Use direct `process.env.KEY` access (no dynamic keys) so Edge/Turbopack can inline values.
 */
export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const urlOk = typeof url === "string" && url.trim().length > 0;
  const keyOk = typeof anonKey === "string" && anonKey.trim().length > 0;

  if (!urlOk || !keyOk) {
    throw new Error(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n\n" +
        "1) Create a file named `.env.local` in the project root (same folder as package.json).\n" +
        "2) Paste your real Project URL and anon/publishable key (no <angle brackets>).\n" +
        "3) Stop and restart `npm run dev`.\n\n" +
        "See .env.example for the exact variable names.",
    );
  }

  const u = url.trim();
  const k = anonKey.trim();
  if (
    u.includes("your-project-ref") ||
    u.includes("YOUR_PROJECT_REF") ||
    u.includes("your-project-ref.supabase.co")
  ) {
    throw new Error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL is still a placeholder (your-project-ref). " +
        "Set your real URL from Supabase → Project Settings → API. On Vercel, add it under " +
        "Environment Variables and redeploy so the client bundle picks it up.",
    );
  }

  return { url: u, anonKey: k };
}
