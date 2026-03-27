## Shared Backend

### Module Architecture

- `src/app.js`: express bootstrap only (cors/json/error handler + router mount)
- `src/server.js`: bootstrap only (`app.listen`)
- `src/routes/index.js`: API route aggregator
- `src/config`: env + shared constants
- `src/database`: database client init
- `src/common`: shared utilities
- `src/auth`, `src/users`, `src/activities`, `src/participations`, `src/feedback`, `src/notifications`, `src/recommendations`, `src/admin`, `src/reports`:
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
- `GET /activities/search`
- `GET /activities/:id`
- `POST /activities`
- `PATCH /activities/:id`
- `DELETE /activities/:id`
- `GET /participations`
- `POST /participations`
- `POST /participations/:id/check-in`
- `POST /activities/:id/register`
- `DELETE /activities/:id/register`
- `GET /activities/:id/registrations`
- `GET /registrations/:id`
- `PUT /registrations/:id/approve`
- `PUT /registrations/:id/reject`
- `GET /recommendations/:userId`
- `GET /recommendations/activity/:id`
- `GET /feedback`
- `GET /feedback/review`
- `GET /feedback/:id`
- `PUT /feedback/:id/status`
- `PUT /feedback/:id/flag`
- `POST /feedback`
- `GET /admin/users`
- `PATCH /admin/users/:id`
- `GET /admin/dashboard`
- `GET /organizer/reports/summary`

### Activity Search API

- `GET /activities/search`
  - Query:
    - `keyword=<text>` (or `search=<text>`)
    - `status=all|draft|published|completed|cancelled`
    - `mine=true|false`
    - `date=YYYY-MM-DD` (exact day)
    - `dateFrom=<ISO|YYYY-MM-DD>` and `dateTo=<ISO|YYYY-MM-DD>`
    - `skill=<skill>` or `skill=skill1,skill2`
    - `location=<text>`
    - `limit=1..300`

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

### Sprint 3 Registration API

- `POST /activities/:id/register`
  - Volunteer/admin only.
  - Creates or reopens a registration for the authenticated user on the target activity.
- `DELETE /activities/:id/register`
  - Volunteer/admin only.
  - Cancels the authenticated user's latest registration on the target activity.
- `GET /activities/:id/registrations`
  - Organizer/admin only.
  - Returns all registrations for the target activity.
- `GET /registrations/:id`
  - Admin, owning organizer, or owning volunteer.
  - Returns registration detail with volunteer/activity summary.
- `PUT /registrations/:id/approve`
  - Organizer/admin only.
  - Approves a registration, respecting activity capacity.
- `PUT /registrations/:id/reject`
  - Organizer/admin only.
  - Rejects a registration.

### Sprint 3 Recommendation API

- `GET /recommendations/:userId`
  - Admin or the target user only.
  - If `userId` is a volunteer, returns recommended activities.
  - If `userId` is an organizer, returns recommended volunteers across that organizer's open activities.
  - Query: `limit=1..50`
- `GET /recommendations/activity/:id`
  - Organizer/admin only.
  - Returns recommended volunteers for a specific activity.
  - Query: `limit=1..50`

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

`GET /feedback/review` query params:

- `status=all|pending|in_review|resolved|dismissed` (optional, default `all`)
- `flagged=true|false` (optional)
- `rating=1..5` (optional)
- `keyword=<text>` (optional, searches comment + ids)
- `limit=1..250` (optional, default `100`)

`GET /feedback/:id`

- Returns one feedback entry with moderation metadata.

`PUT /feedback/:id/status` request body:

```json
{
  "status": "in_review"
}
```

`PUT /feedback/:id/flag` request body:

```json
{
  "flag": true,
  "reason": "Potential incident reported by volunteer"
}
```

Note:

- moderation endpoints use existing `participation_feedback` columns when available (no DB migration required).
- if moderation columns are unavailable in your current schema, write operations return `409`.

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

### Organizer Report / Analytics API

- `GET /organizer/reports/summary`
  - Organizer/admin only.
  - Query:
    - `activityId=<uuid>` optional (load report for a specific organizer activity)
    - `organizerId=<uuid>` optional (admin only; query another organizer's report)
  - Returns:
    - `report` object tailored for the organizer report summary UI, including:
      - summary text and activity duration
      - mini metrics (completion rate, average rating, capacity fill)
      - participation totals and trend
      - feedback rating, quote, sentiment chips
      - generated issue highlights
    - `meta` object with generation time, selected activity id, and available activities list.

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
