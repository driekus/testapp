-- Bootstrap script for the first admin allowlist entry.
-- Run AFTER applying schema.sql changes that create public.admin_users and public.is_admin_user().
--
-- 1) Replace owner@example.com with your intended first admin email.
-- 2) Run this script in the Supabase SQL editor as a privileged role.

begin;

with target_user as (
  select id
  from auth.users
  where lower(email) = lower('owner@example.com')
  order by created_at asc
  limit 1
)
insert into public.admin_users (user_id, created_by)
select id, id
from target_user
on conflict (user_id) do nothing;

-- Sanity check: should return exactly one row for the seeded admin.
select au.user_id, u.email, au.created_at
from public.admin_users au
join auth.users u on u.id = au.user_id
where lower(u.email) = lower('owner@example.com');

commit;

