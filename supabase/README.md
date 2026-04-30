# Supabase database

## Apply the schema

### Option A — SQL Editor (fastest)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste the contents of `migrations/00000000000000_mvp_core_schema.sql`.
3. Run once. Fix any errors (rare if extensions already enabled).

## Seed questions + rubrics (from the app prototype)

After the migration succeeds:

1. In **SQL Editor**, open and paste the full contents of **`seed.sql`** (repo root: `supabase/seed.sql`).
2. Run once. It is **idempotent** for set slug **`mvp-orals-v1`**: it deletes existing questions/rubrics under that set, then re-inserts.

The Next.js **`/practice`** page loads that set by default (`question_sets.slug = mvp-orals-v1`). Override with env **`ORAL_QUESTION_SET_SLUG`** if you use a different slug.

**Note:** Questions are inserted with `status = 'published'` so authenticated users can read them under current RLS.

### Option B — Supabase CLI

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

(Requires [Supabase CLI](https://supabase.com/docs/guides/cli) and a linked project.)

## Notes

- **Users:** Authentication uses `auth.users`. App profile data lives in `public.profiles` (auto-created on signup via trigger).
- **Secrets:** Use the **service role** key only in server-side scripts/API routes — never in the browser.
- **RLS:** Policies allow authenticated users to read **published** content and manage **their own** attempts, scores, bookmarks, and progress. Content writes are intended for **service role** (admin API / seed) until you add admin policies.
