-- =============================================================================
-- Checkride AI — MVP core schema (Postgres / Supabase)
-- Run once in SQL Editor or via `supabase db push`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- updated_at helper
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — extends auth.users (your “users” row for app data)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- question_sets
-- -----------------------------------------------------------------------------
create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  is_active boolean not null default true,
  version int not null default 1,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger question_sets_set_updated_at
before update on public.question_sets
for each row execute function public.set_updated_at();

create index question_sets_is_active_idx on public.question_sets (is_active) where is_active = true;

-- -----------------------------------------------------------------------------
-- questions
-- -----------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references public.question_sets (id) on delete cascade,
  slug text not null,
  context_label text not null,
  prompt_line text not null,
  scenario text not null,
  sample_answer jsonb not null default '[]'::jsonb,
  order_index int not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  version int not null default 1,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_set_id, slug)
);

create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

create index questions_set_order_idx on public.questions (question_set_id, order_index);
create index questions_status_idx on public.questions (status) where status = 'published';

-- -----------------------------------------------------------------------------
-- rubrics — one row per rubric line / criterion for a question
-- -----------------------------------------------------------------------------
create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label text not null,
  keywords jsonb not null default '[]'::jsonb,
  weight numeric not null default 1,
  must_have boolean not null default false,
  sort_order int not null default 0,
  version int not null default 1,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger rubrics_set_updated_at
before update on public.rubrics
for each row execute function public.set_updated_at();

create index rubrics_question_idx on public.rubrics (question_id, sort_order);

-- -----------------------------------------------------------------------------
-- attempts
-- -----------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid references public.questions (id) on delete set null,
  raw_answer text not null,
  session_id text,
  submitted_at timestamptz not null default now(),
  latency_ms int,
  created_at timestamptz not null default now()
);

create index attempts_user_submitted_idx on public.attempts (user_id, submitted_at desc);
create index attempts_question_idx on public.attempts (question_id);

-- -----------------------------------------------------------------------------
-- attempt_scores — one row per attempt
-- -----------------------------------------------------------------------------
create table public.attempt_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.attempts (id) on delete cascade,
  rules_score int not null check (rules_score between 0 and 3),
  final_score int not null check (final_score between 0 and 3),
  score_source text not null default 'rules'
    check (score_source in ('rules', 'hybrid', 'llm')),
  matched_points jsonb not null default '[]'::jsonb,
  missed_points jsonb not null default '[]'::jsonb,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger attempt_scores_set_updated_at
before update on public.attempt_scores
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- bookmarks — Review later
-- -----------------------------------------------------------------------------
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create index bookmarks_user_idx on public.bookmarks (user_id);

-- -----------------------------------------------------------------------------
-- progress_snapshots — current progress per user + question (MVP; upsert this row)
-- -----------------------------------------------------------------------------
create table public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create trigger progress_snapshots_set_updated_at
before update on public.progress_snapshots
for each row execute function public.set_updated_at();

create index progress_snapshots_user_idx on public.progress_snapshots (user_id);

-- -----------------------------------------------------------------------------
-- content_versions — audit trail for published entities
-- -----------------------------------------------------------------------------
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('question_set', 'question', 'rubric')),
  entity_id uuid not null,
  version_no int not null,
  snapshot jsonb not null,
  change_note text,
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, version_no)
);

create index content_versions_entity_idx on public.content_versions (entity_type, entity_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.rubrics enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_scores enable row level security;
alter table public.bookmarks enable row level security;
alter table public.progress_snapshots enable row level security;
alter table public.content_versions enable row level security;

-- profiles: own row only
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Published catalog: any signed-in user can read
create policy "question_sets_select_active_published"
  on public.question_sets for select
  using (auth.role() = 'authenticated' and is_active = true);

create policy "questions_select_published"
  on public.questions for select
  using (auth.role() = 'authenticated' and status = 'published');

create policy "rubrics_select_for_published_questions"
  on public.rubrics for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.questions q
      where q.id = rubrics.question_id and q.status = 'published'
    )
  );

-- attempts: own rows
create policy "attempts_select_own"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "attempts_insert_own"
  on public.attempts for insert
  with check (auth.uid() = user_id);

create policy "attempts_update_own"
  on public.attempts for update
  using (auth.uid() = user_id);

-- attempt_scores: only if parent attempt is yours
create policy "attempt_scores_select_own"
  on public.attempt_scores for select
  using (
    exists (
      select 1 from public.attempts a
      where a.id = attempt_scores.attempt_id and a.user_id = auth.uid()
    )
  );

create policy "attempt_scores_insert_own"
  on public.attempt_scores for insert
  with check (
    exists (
      select 1 from public.attempts a
      where a.id = attempt_scores.attempt_id and a.user_id = auth.uid()
    )
  );

create policy "attempt_scores_update_own"
  on public.attempt_scores for update
  using (
    exists (
      select 1 from public.attempts a
      where a.id = attempt_scores.attempt_id and a.user_id = auth.uid()
    )
  );

-- bookmarks
create policy "bookmarks_select_own"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "bookmarks_insert_own"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "bookmarks_delete_own"
  on public.bookmarks for delete
  using (auth.uid() = user_id);

-- progress_snapshots
create policy "progress_snapshots_select_own"
  on public.progress_snapshots for select
  using (auth.uid() = user_id);

create policy "progress_snapshots_insert_own"
  on public.progress_snapshots for insert
  with check (auth.uid() = user_id);

create policy "progress_snapshots_update_own"
  on public.progress_snapshots for update
  using (auth.uid() = user_id);

-- content_versions: no client reads by default (use service role for admin)
-- Add a policy later if you expose version history in the app.
