-- I ran those query step by step, do not touch
-- Lok

--Apply minimal self-access RLS policies (safe baseline)
alter table public.users enable row level security;

create policy "users_select_own" on public.users for
select to authenticated using (auth.uid () = id);

create policy "users_insert_own" on public.users for
insert
    to authenticated
with
    check (auth.uid () = id);

create policy "users_update_own" on public.users for
update to authenticated using (auth.uid () = id)
with
    check (auth.uid () = id);

--Add auto-create trigger for new auth users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, role, full_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'volunteer'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'active'
  )
  on conflict (id) do update
  set
    role = excluded.role,
    full_name = excluded.full_name,
    status = excluded.status;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

--Backfill existing accounts missing public.users
insert into
    public.users (id, role, full_name, status)
select au.id, coalesce(
        au.raw_user_meta_data ->> 'role', 'volunteer'
    ), coalesce(
        au.raw_user_meta_data ->> 'full_name', split_part (au.email, '@', 1)
    ), 'active'
from auth.users au
    left join public.users pu on pu.id = au.id
where
    pu.id is null;