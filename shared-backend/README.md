## Shared Backend

### Module Architecture

- `src/app.js`: express bootstrap only (cors/json/error handler + router mount)
- `src/server.js`: bootstrap only (`app.listen`)
- `src/routes/index.js`: API route aggregator
- `src/config`: env + shared constants
- `src/database`: database client init
- `src/common`: shared utilities
- `src/auth`, `src/users`, `src/activities`, `src/participations`, `src/feedback`, `src/notifications`, `src/admin`:
  each domain contains dedicated `*.routes.js`, `*.service.js`, and `*.validation.js` (when needed)

All active endpoints are mounted directly at root path (no `/api` prefix).

### Run Backend

From `V-Connect/shared-backend`:

```bash
npm install
npm run dev
```

Expected log:

```text
shared-backend listening on http://localhost:3000
```

### Core Endpoints

- `GET /health`
- `POST /auth/reset-password`
- `GET /auth/me`
- `POST /auth/register-profile`
- `GET /activities`
- `GET /activities/:id`
- `POST /activities`
- `PATCH /activities/:id`
- `DELETE /activities/:id`
- `GET /participations`
- `POST /participations`
- `POST /participations/:id/check-in`
- `GET /feedback`
- `POST /feedback`
- `GET /admin/users`
- `PATCH /admin/users/:id`
- `GET /admin/dashboard`

### Attendance / Check-in API

- `GET /participations`
  - Query: `mine=true|false`, `activityId=<uuid>`, `status=all|pending|approved|rejected|checked_in`, `limit=1..300`
  - Role behavior:
    - `volunteer`: only own participations
    - `organizer`: only participations from own activities
    - `admin`: all (or own with `mine=true`)
- `POST /participations`
  - Body: `{ "activityId": "<activity_uuid>" }`
  - Creates a participation record for the authenticated volunteer/admin account (`status = pending`).
- `POST /participations/:id/check-in`
  - Organizer/admin only.
  - Marks a participation as checked in (`status = checked_in` and `checked_in_at` when the column exists).

### Feedback API

`POST /feedback` request body:

```json
{
  "participationId": "<participation_uuid>",
  "rating": 5,
  "comment": "Great onboarding flow. Please keep the quick filters."
}
```

`GET /feedback` query params:

- `mine=true|false` (non-admin users can only query their own feedback)
- `rating=1..5` (optional filter)
- `participationId=<uuid>` (optional filter)
- `limit=1..200` (optional, default `50`)

Required Supabase table:

```sql
create table if not exists public.participation_feedback (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.activity_participations(id),
  volunteer_id uuid not null references public.users(id),
  organizer_id uuid references public.users(id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
```

You can run the ready-made SQL file in this repo:

- `shared-backend/scripts/createFeedbackTable.sql`

### Profile Migration

Use this to backfill `public.users` and `volunteer_profiles` for existing `auth.users`.

```bash
npm run migrate:profiles -- --dry-run
npm run migrate:profiles
```

### Stop Backend

1. In the terminal that is running backend, press `Ctrl + C`.
2. If the process is stuck, in PowerShell run:

```powershell
Get-Process node | Stop-Process -Force
```

### Required Environment Variables

- `PORT` (optional, default `3000`)
- `FRONTEND_ORIGIN` (optional, default `http://localhost:5173`)
- `PASSWORD_RESET_REDIRECT_TO` (optional, default `${FRONTEND_ORIGIN}/reset-password`)
- `SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

### Password Reset API

Request:

```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Success response:

```json
{
  "success": true,
  "message": "If the email is registered, a password reset link has been sent."
}
```
