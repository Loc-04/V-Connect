-- Create notifications table for GET/POST /notifications API.
-- Run in Supabase SQL editor.

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  message text not null,
  type text default 'info',
  data jsonb default '{}'::jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_read_at_idx on public.notifications (read_at);
