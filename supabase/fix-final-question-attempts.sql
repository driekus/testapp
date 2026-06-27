-- Idempotent repair script for final-question attempts table and schema cache.
-- Run this in Supabase SQL Editor when submit-final-answer reports missing table.

create table if not exists public.final_question_attempts (
  id                uuid        primary key default gen_random_uuid(),
  game_id           uuid        not null references public.games(id) on delete cascade,
  player_id         text        not null,
  player_session_id text        not null,
  submitted_answer  text        not null,
  is_correct        boolean     not null default false,
  created_at        timestamptz not null default now(),
  unique (game_id, player_session_id)
);

alter table public.final_question_attempts enable row level security;

drop policy if exists "Service role manages final question attempts" on public.final_question_attempts;

create policy "Service role manages final question attempts"
  on public.final_question_attempts
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';

