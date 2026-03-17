-- create table core_skills

CREATE TABLE core_skills (
    id uuid DEFAULT gen_random_uuid () PRIMARY KEY,
    skill_name text UNIQUE NOT NULL
);

-- create policy for core_skills
alter table public.core_skills enable row level security;

create policy "core_skills_select_authenticated" on public.core_skills for
select to authenticated using (true);