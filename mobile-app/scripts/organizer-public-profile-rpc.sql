-- Run this once in the Supabase SQL editor.
-- Adds a SECURITY DEFINER RPC so any authenticated client can fetch a user's
-- public profile fields (full_name, avatar_url, role) without loosening the
-- existing `users_select_own` RLS policy that protects sensitive columns
-- such as phone.

create or replace function public.get_user_public_profile(p_user_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name::text, u.avatar_url, u.role::text
  from public.users u
  where u.id = p_user_id
    and u.deleted_at is null;
$$;

revoke all on function public.get_user_public_profile(uuid) from public;
grant execute on function public.get_user_public_profile(uuid) to authenticated;

-- Batch lookup variant used when several user ids must be resolved at once
-- (e.g. recommended-volunteers list on the organizer dashboard).
create or replace function public.get_users_public_profiles(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name::text, u.avatar_url, u.role::text
  from public.users u
  where u.id = any(p_user_ids)
    and u.deleted_at is null;
$$;

revoke all on function public.get_users_public_profiles(uuid[]) from public;
grant execute on function public.get_users_public_profiles(uuid[]) to authenticated;
