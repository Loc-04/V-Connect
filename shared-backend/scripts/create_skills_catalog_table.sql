-- Create shared skills catalog table for web skill selection flows.
-- Run with:
-- npm run db:apply -- --file ./scripts/create_skills_catalog_table.sql

create table if not exists public.core_skills (
  id uuid primary key default gen_random_uuid(),
  skill_name text not null unique
);

alter table public.core_skills
  add column if not exists skill_name text;

create unique index if not exists core_skills_skill_name_unique_idx on public.core_skills (skill_name);

insert into public.core_skills (skill_name)
values
  ('Communication'),
  ('Teamwork'),
  ('Leadership'),
  ('Problem Solving'),
  ('Time Management'),
  ('Project Coordination'),
  ('Volunteer Coordination'),
  ('Event Planning'),
  ('Facilitation'),
  ('Mentoring'),
  ('Teaching'),
  ('Public Speaking'),
  ('Conflict Resolution'),
  ('Community Outreach'),
  ('Customer Service'),
  ('First Aid'),
  ('Data Entry'),
  ('Documentation'),
  ('Research'),
  ('Writing'),
  ('Graphic Design'),
  ('Photography')
on conflict (skill_name) do nothing;
