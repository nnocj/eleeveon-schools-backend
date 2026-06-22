# Eleeveon Schools Backend Upgrade

This ZIP is a drop-in `src` replacement generated from your uploaded backend source.

## Backward-compatible decisions

- Existing modules, controller routes, and service names are preserved.
- Existing `/sync/push`, `/sync/pull`, `/sync/status`, and `/sync/diagnostics` remain available.
- Existing auth, account, billing, permission, finance, payroll, communications, and developer-sql modules remain in place.
- The sync service still stores operational school records through `SyncRecord` so current frontend pages keep working.

## Added platform-ready support

- `POST /sync/bootstrap`
- `POST /sync/platform-cache`
- `POST /sync/devices/register`
- `GET /sync/conflicts`
- `POST /sync/conflicts/:id/resolve`

These support the upgraded `db.ts` and sync folder you generated earlier.

## Safety rules

- Normal school records can still push/pull via `SyncRecord`.
- Backend-owned cache records are pulled through platform cache endpoints.
- Sensitive backend-only tables are blocked from browser push: sessions, API keys, webhook secrets, audit logs, background jobs, etc.
- Device registration and conflict tracking are designed not to break normal sync if they fail.

## Important

Run Prisma generate after placing the upgraded Prisma schema:

```bash
npx prisma generate
```

Then rebuild your Nest backend.
