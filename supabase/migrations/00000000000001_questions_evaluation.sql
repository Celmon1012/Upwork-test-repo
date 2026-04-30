-- Teaching / debrief copy for each question (matches EvaluationBlock in the app).
-- Run after 00000000000000_mvp_core_schema.sql

alter table public.questions
  add column if not exists evaluation jsonb not null default '{}'::jsonb;

comment on column public.questions.evaluation is
  'JSON: score, outcomeLabel, judgment, examinerNote, correct[], missed[], stronger, why, deeperExplanation[]';
