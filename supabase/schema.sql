-- Supabase schema for Letter Quest
-- Safe to run multiple times.

-- -----------------------------------------------------------------------------
-- Shared config table used by the game page (public read, auth write)
-- -----------------------------------------------------------------------------
create table if not exists public.shared_config (
  id integer primary key default 1,
  route jsonb not null,
  updated_at timestamptz not null default now(),
  constraint shared_config_single_row check (id = 1)
);

alter table public.shared_config enable row level security;

drop policy if exists "Anyone can read shared config" on public.shared_config;
drop policy if exists "Authenticated users can insert shared config" on public.shared_config;
drop policy if exists "Authenticated users can update shared config" on public.shared_config;

create policy "Anyone can read shared config"
  on public.shared_config
  for select
  using (true);

create policy "Authenticated users can insert shared config"
  on public.shared_config
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update shared config"
  on public.shared_config
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Optional starter row. Safe to keep: does nothing if row id=1 already exists.
insert into public.shared_config (id, route)
values (
  1,
  '[
    {"name":"Location 1","lat":52.3676,"lng":4.9041,"letter":"A"},
    {"name":"Location 2","lat":52.3702,"lng":4.8952,"letter":"B"},
    {"name":"Location 3","lat":52.3639,"lng":4.8910,"letter":"C"},
    {"name":"Location 4","lat":52.3597,"lng":4.8994,"letter":"D"},
    {"name":"Location 5","lat":52.3728,"lng":4.9074,"letter":"E"}
  ]'::jsonb
)
on conflict (id) do nothing;
