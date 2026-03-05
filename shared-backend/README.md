## Shared Backend

### Unified Architecture

- `src/app.js`: single API application (routes + middleware + Supabase admin client)
- `src/server.js`: bootstrap only (`app.listen`)

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
- `GET /auth/me`
- `POST /auth/register-profile`
- `GET /admin/users`
- `PATCH /admin/users/:id`
- `GET /admin/dashboard`

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
- `SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
