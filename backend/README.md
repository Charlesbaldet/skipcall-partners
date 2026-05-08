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
