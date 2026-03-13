-- Create feedback table for shared-backend /feedback endpoints
-- Run in Supabase SQL Editor for your project

create extension if not exists pgcrypto;

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  category text not null default 'general',
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedbacks_user_id_idx on public.feedbacks(user_id);
create index if not exists feedbacks_created_at_idx on public.feedbacks(created_at desc);
create index if not exists feedbacks_category_idx on public.feedbacks(category);

-- Optional: force PostgREST schema cache reload immediately
notify pgrst, 'reload schema';
