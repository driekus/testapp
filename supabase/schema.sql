-- Supabase schema for Letter Quest — multi-game, multi-route edition
-- Safe to run on a fresh database.
-- For migration from the previous single-route schema, see the bottom of this file.

-- -----------------------------------------------------------------------------
-- games — one row per named game
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique,
  display_name text        not null,
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- admin_users — allowlist of app-level admins
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users(id)
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

drop policy if exists "Admins can read admin_users"      on public.admin_users;
drop policy if exists "Admins can manage admin_users"    on public.admin_users;

create policy "Admins can read admin_users"
  on public.admin_users for select
  using (auth.uid() = user_id or public.is_admin_user());

create policy "Admins can manage admin_users"
  on public.admin_users for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

alter table public.games enable row level security;

drop policy if exists "Anyone can read games"                   on public.games;
drop policy if exists "Authenticated users can insert games"    on public.games;
drop policy if exists "Authenticated users can update games"    on public.games;
drop policy if exists "Authenticated users can delete games"    on public.games;
drop policy if exists "Admins can insert games"                 on public.games;
drop policy if exists "Admins can update games"                 on public.games;
drop policy if exists "Admins can delete games"                 on public.games;

create policy "Anyone can read games"
  on public.games for select using (true);

create policy "Admins can insert games"
  on public.games for insert with check (public.is_admin_user());

create policy "Admins can update games"
  on public.games for update
  using  (public.is_admin_user())
  with check (public.is_admin_user());

create policy "Admins can delete games"
  on public.games for delete using (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- routes — ordered list of 5-location routes that belong to a game
-- -----------------------------------------------------------------------------
create table if not exists public.routes (
  id           uuid        primary key default gen_random_uuid(),
  game_id      uuid        not null references public.games(id) on delete cascade,
  order_index  integer     not null default 0,
  display_name text        not null default 'Route 1',
  route        jsonb       not null,
  updated_at   timestamptz not null default now(),
  unique (game_id, order_index)
);

alter table public.routes enable row level security;

drop policy if exists "Anyone can read routes"                   on public.routes;
drop policy if exists "Authenticated users can insert routes"    on public.routes;
drop policy if exists "Authenticated users can update routes"    on public.routes;
drop policy if exists "Authenticated users can delete routes"    on public.routes;
drop policy if exists "Admins can insert routes"                 on public.routes;
drop policy if exists "Admins can update routes"                 on public.routes;
drop policy if exists "Admins can delete routes"                 on public.routes;

create policy "Anyone can read routes"
  on public.routes for select using (true);

create policy "Admins can insert routes"
  on public.routes for insert with check (public.is_admin_user());

create policy "Admins can update routes"
  on public.routes for update
  using  (public.is_admin_user())
  with check (public.is_admin_user());

create policy "Admins can delete routes"
  on public.routes for delete using (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- Migration: remove legacy route column from games if it still exists
-- -----------------------------------------------------------------------------
alter table public.games drop column if exists route;

-- -----------------------------------------------------------------------------
-- Starter data — safe to run multiple times
-- -----------------------------------------------------------------------------
do $$
declare
  v_game_id uuid;
begin
  insert into public.games (slug, display_name)
  values ('amsterdam-tour', 'Amsterdam Tour')
  on conflict (slug) do nothing
  returning id into v_game_id;

  if v_game_id is not null then
    insert into public.routes (game_id, order_index, display_name, route)
    values
      (v_game_id, 0, 'Route 1', '[
        {"name":"Location 1","lat":52.3676,"lng":4.9041,"letter":"A"},
        {"name":"Location 2","lat":52.3702,"lng":4.8952,"letter":"B"},
        {"name":"Location 3","lat":52.3639,"lng":4.8910,"letter":"C"},
        {"name":"Location 4","lat":52.3597,"lng":4.8994,"letter":"D"},
        {"name":"Location 5","lat":52.3728,"lng":4.9074,"letter":"E"}
      ]'::jsonb),
      (v_game_id, 1, 'Route 2', '[
        {"name":"Stop A","lat":52.3750,"lng":4.9000,"letter":"F"},
        {"name":"Stop B","lat":52.3720,"lng":4.8870,"letter":"G"},
        {"name":"Stop C","lat":52.3680,"lng":4.8800,"letter":"H"},
        {"name":"Stop D","lat":52.3610,"lng":4.8920,"letter":"I"},
        {"name":"Stop E","lat":52.3640,"lng":4.9060,"letter":"J"}
      ]'::jsonb);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Payment columns on games
-- -----------------------------------------------------------------------------
alter table public.games add column if not exists requires_payment boolean not null default false;
alter table public.games add column if not exists price_in_cents   integer  not null default 0;
alter table public.games add column if not exists supports_offline boolean not null default false;
alter table public.games add column if not exists final_question   text     not null default '';
alter table public.games add column if not exists final_answer     text     not null default '';

-- -----------------------------------------------------------------------------
-- game_final_answers — protected store for final-question answers
-- -----------------------------------------------------------------------------
create table if not exists public.game_final_answers (
  game_id      uuid        primary key references public.games(id) on delete cascade,
  final_answer text        not null default '',
  updated_at   timestamptz not null default now()
);

alter table public.game_final_answers enable row level security;

drop policy if exists "Authenticated users can read game_final_answers"   on public.game_final_answers;
drop policy if exists "Authenticated users can insert game_final_answers" on public.game_final_answers;
drop policy if exists "Authenticated users can update game_final_answers" on public.game_final_answers;
drop policy if exists "Authenticated users can delete game_final_answers" on public.game_final_answers;
drop policy if exists "Admins can read game_final_answers"                on public.game_final_answers;
drop policy if exists "Admins can insert game_final_answers"              on public.game_final_answers;
drop policy if exists "Admins can update game_final_answers"              on public.game_final_answers;
drop policy if exists "Admins can delete game_final_answers"              on public.game_final_answers;

create policy "Admins can read game_final_answers"
  on public.game_final_answers for select using (public.is_admin_user());

create policy "Admins can insert game_final_answers"
  on public.game_final_answers for insert with check (public.is_admin_user());

create policy "Admins can update game_final_answers"
  on public.game_final_answers for update
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "Admins can delete game_final_answers"
  on public.game_final_answers for delete using (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- payment_sessions — one row per payment attempt
-- -----------------------------------------------------------------------------
create table if not exists public.payment_sessions (
  id                    uuid        primary key default gen_random_uuid(),
  game_slug             text        not null references public.games(slug) on delete cascade,
  payment_request_token text        not null unique,
  payment_token         text        unique,
  paid                  boolean     not null default false,
  played                boolean     not null default false,
  player_name           text,
  player_phone          text,
  letters_collected     jsonb       not null default '[]',
  amount_in_cents       integer,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  played_at             timestamptz
);

alter table public.payment_sessions enable row level security;

drop policy if exists "Service role manages payment sessions" on public.payment_sessions;

-- Only edge functions (service role) read/write — no direct anon access
create policy "Service role manages payment sessions"
  on public.payment_sessions
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Clean up legacy tables if present
drop table if exists public.shared_config;
drop table if exists public.user_configs;

-- -----------------------------------------------------------------------------
-- game_styles — CSS variables per game for customer branding
-- -----------------------------------------------------------------------------
create table if not exists public.game_styles (
  id                           uuid        primary key default gen_random_uuid(),
  game_id                      uuid        not null unique references public.games(id) on delete cascade,
  -- Primary colors
  primary_color                text        not null default '#2f7dff',
  primary_text_color           text        not null default '#ffffff',
  primary_hover_color          text        not null default '#1e5ecf',
  -- Background & text
  bg_color                     text        not null default '#f5f7fb',
  text_color                   text        not null default '#1f2937',
  text_muted_color             text        not null default '#6b7280',
  text_hint_color              text        not null default '#4b5563',
  -- Cards & borders
  card_bg_color                text        not null default '#ffffff',
  card_border_color            text        not null default '#d9e2ef',
  -- Accents
  accent_color_teal            text        not null default '#0f766e',
  accent_color_amber           text        not null default '#fef3c7',
  accent_text_amber            text        not null default '#92400e',
  accent_bg_blue               text        not null default '#f0f5ff',
  accent_border_blue           text        not null default '#c3d4f7',
  accent_text_blue             text        not null default '#1d4ed8',
  -- Inputs
  input_border_color           text        not null default '#bcccdc',
  input_bg_color               text        not null default '#ffffff',
  input_text_color             text        not null default '#1f2937',
  -- Dark mode
  dark_bg_color                text        not null default '#0f172a',
  dark_text_color              text        not null default '#e5e7eb',
  dark_card_bg_color           text        not null default '#111827',
  dark_card_border_color       text        not null default '#374151',
  dark_input_bg_color          text        not null default '#0b1220',
  dark_input_border_color      text        not null default '#334155',
  dark_accent_bg_blue          text        not null default '#1e2d4a',
  dark_accent_border_blue      text        not null default '#3b5a9a',
  dark_accent_text_blue        text        not null default '#93c5fd',
  -- Font
  font_family                  text        not null default 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  -- Spacing & borders
  border_radius_sm             text        not null default '8px',
  border_radius_md             text        not null default '10px',
  border_radius_lg             text        not null default '12px',
  updated_at                   timestamptz not null default now()
);

alter table public.game_styles enable row level security;

drop policy if exists "Anyone can read game_styles"                   on public.game_styles;
drop policy if exists "Authenticated users can insert game_styles"    on public.game_styles;
drop policy if exists "Authenticated users can update game_styles"    on public.game_styles;
drop policy if exists "Authenticated users can delete game_styles"    on public.game_styles;
drop policy if exists "Admins can insert game_styles"                 on public.game_styles;
drop policy if exists "Admins can update game_styles"                 on public.game_styles;
drop policy if exists "Admins can delete game_styles"                 on public.game_styles;

create policy "Anyone can read game_styles"
  on public.game_styles for select using (true);

create policy "Admins can insert game_styles"
  on public.game_styles for insert with check (public.is_admin_user());

create policy "Admins can update game_styles"
  on public.game_styles for update
  using  (public.is_admin_user())
  with check (public.is_admin_user());

create policy "Admins can delete game_styles"
  on public.game_styles for delete using (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- game_scores + score_events — player progress and leaderboard metrics
-- -----------------------------------------------------------------------------
create table if not exists public.game_scores (
  id                      uuid        primary key default gen_random_uuid(),
  game_id                 uuid        not null references public.games(id) on delete cascade,
  player_id               text        not null,
  player_session_id       text        not null,
  display_name            text,
  score                   integer     not null default 0,
  locations_found         integer     not null default 0,
  arrivals_confirmed      integer     not null default 0,
  questions_answered      integer     not null default 0,
  questions_skipped       integer     not null default 0,
  total_answer_time_ms    bigint      not null default 0,
  updated_at              timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  unique (game_id, player_session_id)
);

alter table public.game_scores add column if not exists player_id text;
update public.game_scores set player_id = player_session_id where player_id is null;
alter table public.game_scores alter column player_id set not null;

create table if not exists public.score_events (
  id                      uuid        primary key default gen_random_uuid(),
  game_id                 uuid        not null references public.games(id) on delete cascade,
  player_id               text        not null,
  player_session_id       text        not null,
  event_key               text        not null,
  event_type              text        not null,
  points_delta            integer     not null,
  answer_time_ms          bigint      not null default 0,
  created_at              timestamptz not null default now(),
  unique (game_id, player_session_id, event_key)
);

alter table public.score_events add column if not exists player_id text;
update public.score_events set player_id = player_session_id where player_id is null;
alter table public.score_events alter column player_id set not null;

alter table public.game_scores enable row level security;
alter table public.score_events enable row level security;

drop policy if exists "Service role manages game scores" on public.game_scores;
drop policy if exists "Service role manages score events" on public.score_events;

create policy "Service role manages game scores"
  on public.game_scores
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages score events"
  on public.score_events
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- final_question_attempts — one final-question attempt per play session
-- -----------------------------------------------------------------------------
create table if not exists public.final_question_attempts (
  id                      uuid        primary key default gen_random_uuid(),
  game_id                 uuid        not null references public.games(id) on delete cascade,
  player_id               text        not null,
  player_session_id       text        not null,
  submitted_answer        text        not null,
  is_correct              boolean     not null default false,
  created_at              timestamptz not null default now(),
  unique (game_id, player_session_id)
);

alter table public.final_question_attempts enable row level security;

drop policy if exists "Service role manages final question attempts" on public.final_question_attempts;

create policy "Service role manages final question attempts"
  on public.final_question_attempts
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Storage bucket for location images (public read, authenticated write)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read location images"          on storage.objects;
drop policy if exists "Authenticated upload location images" on storage.objects;
drop policy if exists "Authenticated delete location images" on storage.objects;
drop policy if exists "Admin upload location images"         on storage.objects;
drop policy if exists "Admin delete location images"         on storage.objects;

create policy "Public read location images"
  on storage.objects for select
  using (bucket_id = 'location-images');

create policy "Admin upload location images"
  on storage.objects for insert
  with check (bucket_id = 'location-images' and public.is_admin_user());

create policy "Admin delete location images"
  on storage.objects for delete
  using (bucket_id = 'location-images' and public.is_admin_user());

-- Refresh PostgREST schema cache after DDL changes.
notify pgrst, 'reload schema';

