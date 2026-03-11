-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organizer_id uuid,
  title character varying NOT NULL,
  description text NOT NULL,
  location jsonb NOT NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  capacity integer NOT NULL,
  required_skills ARRAY DEFAULT '{}'::text[],
  status character varying DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'published'::character varying, 'completed'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT activities_pkey PRIMARY KEY (id),
  CONSTRAINT activities_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id)
);

CREATE TABLE public.activity_participations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  activity_id uuid,
  volunteer_id uuid,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'checked_in'::character varying, 'cancelled'::character varying]::text[])),
  ai_match_score double precision,
  checked_in_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_participations_pkey PRIMARY KEY (id),
  CONSTRAINT activity_participations_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id),
  CONSTRAINT activity_participations_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES public.users(id)
);

CREATE TABLE public.activity_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  activity_id uuid UNIQUE,
  ai_summary text NOT NULL,
  key_outcomes ARRAY DEFAULT '{}'::text[],
  identified_issues ARRAY DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_reports_pkey PRIMARY KEY (id),
  CONSTRAINT activity_reports_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id)
);

CREATE TABLE public.participation_feedback (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    participation_id uuid NOT NULL UNIQUE,
    volunteer_id uuid NOT NULL,
    organizer_id uuid,
    rating smallint NOT NULL CHECK (
        rating >= 1
        AND rating <= 5
    ),
    comment text,
    created_at timestamp
    with
        time zone NOT NULL DEFAULT now(),
        CONSTRAINT participation_feedback_pkey PRIMARY KEY (id),
        CONSTRAINT participation_feedback_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.activity_participations (id),
        CONSTRAINT participation_feedback_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES public.users (id),
        CONSTRAINT participation_feedback_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users (id)
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['volunteer'::character varying, 'organizer'::character varying, 'admin'::character varying]::text[])),
  full_name character varying NOT NULL,
  phone character varying UNIQUE,
  avatar_url text,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'banned'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.volunteer_profiles (
  user_id uuid NOT NULL,
  skills ARRAY DEFAULT '{}'::text[],
  interests ARRAY DEFAULT '{}'::text[],
  availability jsonb DEFAULT '{}'::jsonb,
  total_hours integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  impact_score numeric CHECK (impact_score >= 0::numeric AND impact_score <= 100::numeric),
  availability_note text,
  CONSTRAINT volunteer_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT volunteer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);