## Shared Backend

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

### Stop Backend

1. In the terminal that is running backend, press `Ctrl + C`.
2. If the process is stuck, in PowerShell run:

```powershell
Get-Process node | Stop-Process -Force
```

Required env:

- `SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` (optional, default `http://localhost:5173`)
