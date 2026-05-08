# Business Continuity Plan

| Field | Value |
|---|---|
| Document ID | RB-BCP-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This Business Continuity Plan (BCP) defines the recovery objectives, the response to plausible failure scenarios, the backup strategy and the test schedule that together ensure RefBoost can continue to operate — or be promptly restored — in the face of disruptions.

## 2. Recovery Objectives

| Metric | Target |
|---|---|
| **RTO** — Recovery Time Objective | Under **4 hours** for full restore. |
| **RPO** — Recovery Point Objective | Under **24 hours** of data loss tolerated. |
| **Availability target** | **99.9%** (~8.7 hours of downtime per year, maximum). |

## 3. Failure Scenarios and Response

### 3.1 Railway backend down

- **Detection**: `/api/health` probes, Railway dashboard alerts.
- **Response**: Railway runtime auto-restarts the service (typically under 60 seconds).
- **Escalation**: if the outage exceeds 5 minutes, contact Railway support and assess whether to redeploy from the last known-good build.

### 3.2 PostgreSQL corruption or loss

- **Detection**: query failures, integrity errors in logs.
- **Response**: restore from the most recent **Railway daily automated backup** (RPO ≤ 24 hours). Use point-in-time recovery to reduce data loss where possible (within the 7-day window).
- **Verification**: row counts and integrity checks via `backend/scripts/verify-backup.js`.

### 3.3 Vercel CDN outage

- **Detection**: edge probes, customer reports.
- **Response**: Vercel SLA is 99.99% with multi-region auto-failover. For an extended outage, switch DNS at OVH to a static maintenance page hosted on a backup origin.

### 3.4 Confirmed data breach

- **Response**: execute the Incident Response Plan (`incident-response.md`).
- **Regulatory**: notify the CNIL within **72 hours** under RGPD Article 33 if personal data is involved.

### 3.5 GitHub unavailable

- **Response**: code is mirrored on local developer machines; in-flight deploys can be paused without impact on the running service. Existing Vercel and Railway deployments continue to serve traffic from already-built artefacts.

## 4. Backups

| Asset | Strategy |
|---|---|
| Railway PostgreSQL | Daily automated backups; point-in-time recovery for 7 days. |
| Application code | GitHub repository plus Railway / Vercel build artefacts. |
| Environment variables | Variable **names** documented in `backend/README.md`; **values** held only in Railway and Vercel dashboards. |

Backups are not exfiltrated to a separate provider in the current architecture; this is consistent with the platform's own multi-AZ resilience and the documented RPO.

## 5. Test Schedule

| Cadence | Test |
|---|---|
| Quarterly | Restore a backup to a staging database; verify row counts via `backend/scripts/verify-backup.js`. |
| Semi-annual | Vercel rollback drill — promote a previous deployment and validate. |
| Annual | Full BCP review and tabletop exercise covering at least one breach scenario and one infrastructure outage. |

Test results are recorded in the internal compliance log, including date, scope, outcome and any follow-up actions.

## 6. Roles During an Incident

- **Incident Commander**: Charles Baldet, CEO / Security Officer.
- **Communications**: Charles Baldet, with DPO support for any personal-data implications (`dpo@refboost.io`).
- **Sub-processor escalation**: Railway support, Vercel support, OVH support — contact details held in the password manager.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
