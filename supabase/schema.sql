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

alter table public.games enable row level security;

drop policy if exists "Anyone can read games"                   on public.games;
drop policy if exists "Authenticated users can insert games"    on public.games;
drop policy if exists "Authenticated users can update games"    on public.games;
drop policy if exists "Authenticated users can delete games"    on public.games;

create policy "Anyone can read games"
  on public.games for select using (true);

create policy "Authenticated users can insert games"
  on public.games for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update games"
  on public.games for update
  using  (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete games"
  on public.games for delete using (auth.role() = 'authenticated');

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

create policy "Anyone can read routes"
  on public.routes for select using (true);

create policy "Authenticated users can insert routes"
  on public.routes for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update routes"
  on public.routes for update
  using  (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete routes"
  on public.routes for delete using (auth.role() = 'authenticated');

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
-- Storage bucket for location images (public read, authenticated write)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read location images"          on storage.objects;
drop policy if exists "Authenticated upload location images" on storage.objects;
drop policy if exists "Authenticated delete location images" on storage.objects;

create policy "Public read location images"
  on storage.objects for select
  using (bucket_id = 'location-images');

create policy "Authenticated upload location images"
  on storage.objects for insert
  with check (bucket_id = 'location-images' and auth.role() = 'authenticated');

create policy "Authenticated delete location images"
  on storage.objects for delete
  using (bucket_id = 'location-images' and auth.role() = 'authenticated');
