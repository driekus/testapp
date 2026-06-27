-- Idempotent repair script for answer_attempts table and schema cache.
-- Run this in Supabase SQL Editor when check-answer requires server-side max_attempts tracking.

create table if not exists public.answer_attempts (
  id                uuid        primary key default gen_random_uuid(),
  game_id           uuid        not null references public.games(id) on delete cascade,
  player_session_id text        not null,
  route_id          uuid        not null references public.routes(id) on delete cascade,
  location_index    integer     not null,
  wrong_attempts    integer     not null default 0,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (game_id, player_session_id, route_id, location_index)
);

alter table public.answer_attempts enable row level security;

drop policy if exists "Service role manages answer attempts" on public.answer_attempts;

create policy "Service role manages answer attempts"
  on public.answer_attempts
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';

