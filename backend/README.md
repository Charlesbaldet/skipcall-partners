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
