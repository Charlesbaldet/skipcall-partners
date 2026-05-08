# scripts/

Compliance audit scripts. Plain Node.js (CommonJS, no dependencies).
Run from the repo root.

| Script | Purpose |
| --- | --- |
| `audit-tenant-isolation.js` | Catches SQL queries on tenant-scoped tables that have no visible tenant guard. |
| `audit-auth-middleware.js` | Catches Express routes that forgot `authenticate` middleware. |
| `audit-secrets.js` | Catches hardcoded passwords, API keys, bearer tokens and JWTs. |

Each script exits `0` on success and `1` on any finding outside its allow-list. They are wired into `.github/workflows/ci.yml` under the `compliance-audit` job, which gates merge to `main`.

## Run locally

```bash
node scripts/audit-tenant-isolation.js
node scripts/audit-auth-middleware.js
node scripts/audit-secrets.js
```

`audit-tenant-isolation.js --self-test` runs an inline matcher self-check and exits without scanning the tree.

## Allow-lists

Each script reads its sibling `*.allowlist` file. One regex per line; blank lines and lines starting with `#` are ignored. Regex matches against either the relative file path (`backend/routes/foo.js`) or the locator (`backend/routes/foo.js:42`).

| Allow-list | Format | Use it for |
| --- | --- | --- |
| `audit-tenant-isolation.allowlist` | regex | Routes that are deliberately tenant-agnostic (sitemap, health, marketplace public, etc.) or specific lines doing global lookups. |
| `audit-auth-middleware.allowlist` | substring | Whole files that are public by design (auth, blog, sitemap, webhooks, OAuth callbacks). |
| `audit-secrets.allowlist` | regex | Empty by default. Add fixture / test-data lines here only after manual review. |

## Inline skip markers

Both `audit-auth-middleware.js` and `audit-secrets.js` honour an inline `// audit-skip` marker on the same or previous line of the offending statement. Prefer the inline marker over an allow-list entry whenever the exception is local to a single route — it lives next to the code and dies with it on refactor.

```js
// audit-skip: provider webhook (Mollie) — see comment block above
router.post('/webhook', async (req, res) => { ... });
```

## Updating an allow-list

1. Re-run the audit locally.
2. Confirm the finding is a true exception (not a real bug).
3. Add the narrowest pattern that suppresses it. Prefer file:line locators over whole-file regexes — narrower allow-list entries surface regressions earlier.
4. Document the reason in a `#` comment above the entry.

## Detection model — what each script accepts as a guard

### Tenant isolation

A query touching `referrals`, `commissions`, `partners`, `messages`, `conversations`, `news_posts`, `notifications`, `audit_logs` or `notification_queue` passes if any of these appear nearby:

- `tenant_id`, `tenantId`, `req.tenantId`
- `req.skipTenantFilter`, `skipTenantFilter`
- `WHERE tenant_id`, `AND tenant_id`
- the file mounts `router.use(tenantScope)` (file-level enforcement)
- the file uses a `tenantClause(...)` or `tenantFilter(...)` helper

The matcher inspects a 15-line window around the SQL match and the whole enclosing `router.<verb>(...)` block.

### Auth middleware

A `router.<verb>(...)` call passes if any of these appear:

- `authenticate` in the same call (across up to 5 continuation lines)
- `apiKeyAuth` in the same call (public API)
- the file mounts `router.use(authenticate)` or `router.use(apiKeyAuth)`
- the file is in the public-route allow-list
- the call carries `// audit-skip` on the same or previous line

### Secrets

The matcher flags string-literal credentials and skips lines with `process.env.`, placeholder words (`example`, `dummy`, `your_`, `xxxx`, `***`, etc.), JSDoc comment lines (`*`), or an inline `// audit-skip`. The captured value must look like a real token (>= 8 chars of `[A-Za-z0-9_\-.+/=]`) before it counts.
