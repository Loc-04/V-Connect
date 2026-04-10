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
- `GET /profile/skills-availability`
- `PUT /profile/skills-availability`
- `GET /availability-slots`
- `GET /activities`
- `GET /activities/search`
- `GET /activities/:id`
- `POST /activities`
- `PATCH /activities/:id`
- `DELETE /activities/:id`
- `POST /locations/geocode`
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
- `POST /recommendations/activity/:id/assignments`
- `PUT /recommendations/assignments/:id/status`
- `DELETE /recommendations/assignments/:id`
- `GET /feedback`
- `GET /feedback/review`
- `GET /feedback/:id`
- `PUT /feedback/:id/status`
- `PUT /feedback/:id/ai-label`
- `PUT /feedback/:id/flag`
- `POST /feedback`
- `GET /admin/users`
- `GET /admin/notifications`
- `POST /admin/notifications`
- `PUT /admin/notifications/:id`
- `DELETE /admin/notifications/:id`
- `PATCH /admin/users/:id`
- `GET /admin/dashboard`
- `GET /organizer/reports/summary`

### Volunteer Skills / Availability Payload

`GET /profile/skills-availability` returns `availableChoices` as a string array.

Example:

```json
{
  "skillsAvailability": {
    "userId": "<volunteer_uuid>",
    "skills": ["Teamwork", "First Aid"],
    "interests": ["Football", "Community Events"],
    "availableChoices": ["mon_mor", "wed_eve", "sat_aft"],
    "updatedAt": "2026-04-01T10:00:00.000Z"
  }
}
```

`PUT /profile/skills-availability` accepts:

```json
{
  "availableChoices": ["mon_mor", "fri_aft", "sun_eve"]
}
```

Slot format:

- Days: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`
- Sessions: `mor`, `aft`, `eve`

### Activity Location Schema For Map Support

`activities.location` now supports both display text and optional map metadata.

Example:

```json
{
  "address": "74 Phan Thanh",
  "ward": "Phường Thanh Khê",
  "province": "Thành phố Đà Nẵng",
  "city": "Thành phố Đà Nẵng",
  "formattedAddress": "74 Phan Thanh, Phường Thanh Khê, Thành phố Đà Nẵng",
  "mapProvider": "nominatim",
  "geocodedAt": "2026-04-01T11:00:00.000Z",
  "geocodeConfidence": 0.7123,
  "lat": 16.0689012,
  "lng": 108.2011123
}
```

Notes:

- `formattedAddress` is the normalized address string used for map display/open-in-map.
- `lat` / `lng` are optional until the frontend geocoding flow is integrated.
- if the organizer changes address/province/ward without sending fresh coordinates, the backend clears stale map coordinates automatically.

### Location Geocoding API

- `POST /locations/geocode`
  - Any authenticated user.
  - Body:

```json
{
  "address": "74 Phan Thanh",
  "provinceCode": "48",
  "wardCode": "20188"
}
```

  - Response:

```json
{
  "geocodedLocation": {
    "address": "74 Phan Thanh",
    "ward": "Phường Thanh Khê",
    "province": "Thành phố Đà Nẵng",
    "city": "Thành phố Đà Nẵng",
    "provinceCode": "48",
    "wardCode": "20188",
    "formattedAddress": "74 Phan Thanh, Phường Thanh Khê, Thành phố Đà Nẵng",
    "mapProvider": "nominatim",
    "geocodedAt": "2026-04-01T11:00:00.000Z",
    "geocodeConfidence": 0.7123,
    "lat": 16.0689012,
    "lng": 108.2011123,
    "providerDisplayName": "74 Phan Thanh, ..."
  }
}
```

Environment variables for the geocoding provider:

- `MAP_GEOCODING_PROVIDER` (default `nominatim`)
- `MAP_GEOCODING_BASE_URL` (default `https://nominatim.openstreetmap.org/`)
- `MAP_GEOCODING_USER_AGENT`
- `MAP_GEOCODING_EMAIL` (optional, recommended for Nominatim usage policy)
- `MAP_GEOCODING_COUNTRY_CODES` (default `vn`)
- `CHECKIN_CODE_SALT` (optional, default `v-connect-checkin-salt`)

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
  - Body: `{ "checkInCode": "<code>" }`
  - Check-in is allowed only on the same calendar date as `activity.start_time`.
  - Marks a participation as checked in (`status = checked_in` and `checked_in_at` when the column exists).
- `POST /activities/:id/check-in-by-code`
  - Organizer/admin only.
  - Body: `{ "checkInCode": "<code>" }`
  - Resolves the matching registration by code inside the selected activity, then checks in.

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
  - Sends check-in code to the volunteer via in-app notification.
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
- `POST /recommendations/activity/:id/assignments`
  - Organizer/admin only.
  - Body:

```json
{
  "volunteerId": "<volunteer_uuid>"
}
```

  - Creates or reopens an assignment using `activity_participations` with status `assigned`.
- `PUT /recommendations/assignments/:id/status`
  - Organizer/admin only.
  - Body:

```json
{
  "status": "approved"
}
```

  - Allowed statuses: `assigned`, `approved`, `rejected`, `cancelled`
- `DELETE /recommendations/assignments/:id`
  - Organizer/admin only.
  - Logical unassign. Sets status to `cancelled`.

If your Supabase database still rejects the `assigned` status, run:

- `shared-backend/scripts/allowAssignedParticipationStatus.sql`

Or apply it from the terminal after setting `SUPABASE_DB_URL` in `shared-backend/.env`:

```bash
npm run db:apply -- --file=scripts/allowAssignedParticipationStatus.sql
```

### Feedback API

`POST /feedback` request body:

```json
{
  "participationId": "<participation_uuid>",
  "rating": 5,
  "comment": "Great onboarding flow. Please keep the quick filters."
}
```

`POST /feedback` auto-labels `ai_label` as `spam` or `not_spam` based on:

- repeated word/phrase patterns
- promotional/link-like content
- forbidden language signals

`GET /feedback` query params:

- `mine=true|false` (non-admin users can only query their own feedback)
- `rating=1..5` (optional filter)
- `participationId=<uuid>` (optional filter)
- `limit=1..200` (optional, default `50`)

`GET /feedback/review` query params:

- `status=all|pending|in_review|resolved|dismissed` (optional, default `all`)
- `flagged=true|false` (optional)
- `rating=1..5` (optional)
- `keyword=<text>` (optional, searches comment text)
- `limit=1..100` (optional, default `20`)
- `page=1..100000` (optional, default `1`)

Role scope:

- `organizer`: only feedback belonging to activities created by that organizer
- `admin`: all feedback

Feedback review/list/detail responses include:

- `ai_label`: `spam` or `not_spam`
- `is_spam`: boolean convenience field derived from `ai_label`
- `ai_spam_reasons`: detected spam signals for moderation transparency
- `pagination`: `{ page, limit, total, totalPages, hasPrev, hasNext }`

`GET /feedback/:id`

- Returns one feedback entry with moderation metadata.

`PUT /feedback/:id/status` request body:

```json
{
  "status": "in_review"
}
```

`PUT /feedback/:id/ai-label` (admin only) request body:

```json
{
  "label": "spam"
}
```

Allowed label values:

- `spam`
- `not_spam`
- `auto` (clear manual label, fallback to automatic detection)

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
- `PUT /feedback/:id/ai-label` returns `409` when column `ai_label` is unavailable.

Required Supabase table:

```sql
create table if not exists public.participation_feedback (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.activity_participations(id),
  volunteer_id uuid not null references public.users(id),
  organizer_id uuid references public.users(id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  ai_label text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz default now(),
  created_at timestamptz not null default now()
);
```

You can run the ready-made SQL file in this repo:

- `shared-backend/scripts/createFeedbackTable.sql`
- `shared-backend/scripts/addFeedbackAiLabelColumn.sql` (for existing tables missing `ai_label`)
- `shared-backend/scripts/addFeedbackModerationColumns.sql` (for existing tables missing `ai_label/reviewed_at/updated_at`)

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
- `SUPABASE_DB_URL` (required only for local SQL apply scripts such as status/notification table migrations)

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
