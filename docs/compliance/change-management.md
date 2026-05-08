# Change Management Policy

| Field | Value |
|---|---|
| Document ID | RB-CM-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This policy describes how code, configuration and infrastructure changes are introduced into the RefBoost production environment. It is designed to balance the agility required of an early-stage SaaS product with the controls expected of a system holding personal and financial data.

## 2. Deployment Pipeline

The end-to-end pipeline is:

1. Code change is authored locally and pushed to GitHub `main`.
2. Continuous integration runs (`.github/workflows/ci.yml`):
   - Backend syntax check.
   - Frontend build.
   - `npm audit` (production dependencies).
   - Secret scan.
3. On a green CI result, deployment is automatic:
   - **Vercel** deploys the frontend.
   - **Railway** deploys the backend.

A failing CI blocks deployment.

## 3. Change Classification

| Type | Description | Path |
|---|---|---|
| **Hotfix P1 / P2** | Security or availability fix that cannot wait. | Direct push to `main`; expedited review **post-deploy** by the CEO. |
| **Standard feature** | New feature or enhancement. | Push to `main` after local build and manual smoke test. |
| **Infrastructure / config change** | Env var change, sub-processor configuration, schema migration. | Documented in the commit message; env-var changes also recorded in `backend/README.md`. |

## 4. Pre-Deploy Checklist

Before pushing a change to `main`, the author confirms:

- [ ] Local build (`npm run build`) passes.
- [ ] Database migration is **idempotent** and forward-compatible (no destructive `DROP COLUMN` without a multi-step deprecation).
- [ ] No secrets, API tokens or credentials are present in source code.
- [ ] All required environment variables are configured in Railway / Vercel.
- [ ] User-facing changes have been smoke-tested locally.

## 5. Rollback Procedures

- **Vercel (frontend)** — instant rollback through the Vercel dashboard ("Promote previous deployment"). Recovery time: under 2 minutes.
- **Railway (backend)** — `git revert <sha> && git push origin main`; Railway redeploys automatically. Recovery time: typically under 5 minutes.
- **Database migration** — migrations are written to be idempotent, and `ALTER TABLE ... ADD COLUMN` is never automatically removed. To roll back a schema change, a reverse migration block is run manually against the database.

## 6. Branch Protection (Target State)

The current single-developer setup pushes directly to `main` for speed. Once the team grows, the following branch protection rules will be enabled on GitHub:

- Required pull request reviews (at least one approver).
- Required CI checks to pass before merge.
- No force pushes to `main`.
- Linear history enforced.

This evolution is recorded as a roadmap item to be revisited at the first additional engineering hire.

## 7. Audit Trail

Every change is auditable through:

- **Git history** on `main`, including commit message, author and timestamp.
- **Vercel and Railway deployment logs**, retained per platform defaults.
- **`CHANGELOG.md`** for user-visible and security-relevant changes.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
