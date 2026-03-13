-- Create feedback table for shared-backend /feedback endpoints
-- Run in Supabase SQL Editor for your project

create extension if not exists pgcrypto;

create table if not exists public.participation_feedback (
  id uuid not null default gen_random_uuid(),
  participation_id uuid not null unique,
  volunteer_id uuid not null,
  organizer_id uuid,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamp with time zone not null default now(),
  constraint participation_feedback_pkey primary key (id),
  constraint participation_feedback_participation_id_fkey foreign key (participation_id) references public.activity_participations (id),
  constraint participation_feedback_volunteer_id_fkey foreign key (volunteer_id) references public.users (id),
  constraint participation_feedback_organizer_id_fkey foreign key (organizer_id) references public.users (id)
);

create index if not exists participation_feedback_participation_id_idx
  on public.participation_feedback(participation_id);

create index if not exists participation_feedback_volunteer_id_idx
  on public.participation_feedback(volunteer_id);

create index if not exists participation_feedback_organizer_id_idx
  on public.participation_feedback(organizer_id);

create index if not exists participation_feedback_created_at_idx
  on public.participation_feedback(created_at desc);

-- Optional: force PostgREST schema cache reload immediately
notify pgrst, 'reload schema';
