<<<<<<< HEAD
# RefBoost backend

Node + Express API for the RefBoost partner-referral SaaS. Deployed
to Railway (`PORT`, `RAILWAY_GIT_COMMIT_SHA` come from the platform).

## Scripts

- `npm run dev` — nodemon, watches `server.js`.
- `npm start` — production entry (Railway runs this).
- `npm run db:init` — applies `db/init.js`.
- `npm run db:seed` — fixtures for local dev.
- `npm run verify-backup` — JSON spot-check of live DB row counts (see
  `scripts/verify-backup.js`). Exits 1 if any business-critical table
  is empty (truncation sentinel). Railway native backups are managed
  separately via the dashboard / API token.

## Health & status

- `GET /api/health` — public liveness probe. Mounted before the rate
  limiter and before authenticate. Returns 200 / 503 with DB latency,
  heap usage, uptime, and the 7-char Railway commit sha.
- `GET /api/health/incidents` — public, last 30 days of manually
  recorded incidents (rendered by `/status` on the frontend).
- `POST /api/health/incidents` — superadmin only.
- `PATCH /api/health/incidents/:id` — superadmin only.

## Structured logging

`services/logger.js` emits one line of JSON per call (timestamp +
level + message + arbitrary context, with `tenant_id` and
`request_id` always present). Every request is tagged with
`req.requestId` by `middleware/requestId.js`; the id is echoed back
as the `x-request-id` response header so customers can quote it in
support tickets.

## Environment variables

Standard ones live in `.env.example`. Monitoring-specific:

- `ERROR_WEBHOOK_URL` — optional. Slack/Discord/Mattermost-compatible
  incoming webhook. RefBoost POSTs a Slack-shaped payload
  (`{ "text": "🚨 RefBoost Error: …" }`) on every unhandled 5xx error.
  4xx errors stay silent. The payload deliberately omits `req.body`
  to avoid leaking PII or secrets into the destination channel.
- `RAILWAY_GIT_COMMIT_SHA` — set automatically by Railway. The
  health endpoint surfaces the first 7 chars as `version`.
=======
# Backend

Node + Express API. Migrations live in `db/migrate.js` (idempotent
blocks) and run automatically on boot.

## Required environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Session signing key |
| `FRONTEND_URL` | Allowed CORS origin / redirect base |
| `TOKEN_ENCRYPTION_KEY` | AES-256-CBC key for stored API tokens (Pennylane / Qonto / HubSpot / Salesforce). Generate once with `openssl rand -hex 32` and set on Railway. **Required** for any new connect/refresh flow; existing rows keep working as plaintext until next write thanks to the legacy fallback in `utils/crypto.js`. |
| `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `QONTO_CLIENT_ID`, `QONTO_CLIENT_SECRET`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` | Third-party integration keys. |

## One-shot scripts

```
# Re-encrypt every stored API token after provisioning TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY=<hex> node backend/scripts/migrate-encrypt-tokens.js
```

Run once after deploying the env var. Subsequent runs are no-ops
(rows already encrypted are skipped).
>>>>>>> origin/workstream/1-technical-security
