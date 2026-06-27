# Admin Allowlist Rollout Notes

This rollout avoids lockout when moving from broad authenticated admin writes to `public.admin_users` allowlist checks.

## Order of operations

1. Apply `supabase/schema.sql`.
2. Immediately run `supabase/admin-bootstrap.sql` (replace `owner@example.com` first).
3. Verify seeded admin row exists.
4. Test admin UI sign-in with the seeded account.
5. Add any additional admins using SQL (or a future admin-management UI).

## Add another admin

```sql
insert into public.admin_users (user_id, created_by)
select target.id, actor.id
from auth.users target
cross join auth.users actor
where lower(target.email) = lower('new-admin@example.com')
  and lower(actor.email) = lower('owner@example.com')
on conflict (user_id) do nothing;
```

## Recovery playbook (if no admin can edit)

1. Use Supabase SQL editor with project-owner privileges.
2. Insert a known account into `public.admin_users` using `supabase/admin-bootstrap.sql`.
3. Re-login in admin UI and confirm write operations (save game, save route, upload image).

## Notes

- Admin self-sign-up is intentionally disabled in app code (`src/admin/sections/actionsSections.js`).
- Public game reads are still allowed; only privileged write operations are allowlist-gated.

