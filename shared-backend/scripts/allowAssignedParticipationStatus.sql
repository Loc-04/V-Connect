do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'activity_participations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format(
      'alter table public.activity_participations drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.activity_participations
  add constraint activity_participations_status_check
  check (status in ('assigned', 'pending', 'approved', 'rejected', 'checked_in', 'cancelled'));
