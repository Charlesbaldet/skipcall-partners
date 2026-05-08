# Incident Response Plan

| Field | Value |
|---|---|
| Document ID | RB-IR-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This plan defines how GETALEAD SAS detects, contains, eradicates, communicates and learns from security and availability incidents affecting RefBoost. It ensures regulatory obligations (notably RGPD Article 33) are met and that customers are informed in a timely and consistent manner.

## 2. Severity Levels

| Level | Description | Target response time |
|---|---|---|
| **P1 — Critical** | Production data loss, cross-tenant leak, active exploitation, full service outage. | **< 1 hour** |
| **P2 — High** | Partial outage, security incident with no confirmed data exposure. | **< 4 hours** |
| **P3 — Medium** | Degraded functionality, single-tenant impact. | **< 24 hours** |
| **P4 — Low** | Non-blocking issue, minor security finding. | **< 1 week** |

Response time is measured from the moment the incident is acknowledged by the on-call responder.

## 3. Response Process

### 3.1 Phase 1 — Detection

Sources of detection include:

- Backend error reporting via `ERROR_WEBHOOK_URL` (structured logging pipeline).
- `/api/health` probes and external uptime monitors.
- Customer reports (in-app, email, security@refboost.io).
- Inbound vulnerability disclosure or coordinated disclosure reports.

The on-call responder acknowledges the alert and opens an incident ticket.

### 3.2 Phase 2 — Assessment and Containment

- Determine scope: which tenants, which data categories, which services.
- Apply immediate mitigations:
  - Revoke compromised API tokens (rotate `TOKEN_ENCRYPTION_KEY` if root key is suspect).
  - Disable affected endpoints or feature flags.
  - For P1 events, take the service offline if continued operation would worsen the impact.
- Preserve evidence: relevant log excerpts, database snapshots, deployment metadata.

### 3.3 Phase 3 — Eradication

- Identify and fix the root cause.
- Verify that no further exposure is possible (regression test, isolation test).
- Restore service from a known-good state.

### 3.4 Phase 4 — Notification

- **Affected customers** — for P1 and P2 incidents involving their data, notify within the response time targets above.
- **CNIL** — within **72 hours** under RGPD Article 33 if personal data is involved.
- **Internal stakeholders** — CEO / Security Officer and DPO informed at incident open.
- Notifications are tracked in the incident ticket with timestamps and recipients.

### 3.5 Phase 5 — Post-Mortem

For all P1 and P2 incidents, a written post-mortem is produced within 5 working days containing:

- Timeline of detection, response, and resolution.
- Root cause analysis.
- Action items with owners and deadlines.
- A short entry recorded in `CHANGELOG.md` referencing the post-mortem.

## 4. Emergency Contacts

| Role | Contact |
|---|---|
| CEO / Security Officer | Charles Baldet — security@refboost.io |
| Data Protection Officer | dpo@refboost.io |
| Hosting — Backend / DB | Railway support (https://railway.app/help) |
| Hosting — Frontend / CDN | Vercel support (https://vercel.com/help) |

## 5. Communication Templates

### 5.1 Customer Notification (P1 / P2)

> Subject: Security incident notification — RefBoost
>
> On [DATE] at [TIME UTC], we detected a [BRIEF DESCRIPTION] affecting RefBoost. We took immediate action to [CONTAINMENT STEPS]. At this stage, the incident has [LEVEL] severity and [HAS / HAS NOT] resulted in unauthorised access to your data. We will provide a full post-mortem within 5 working days. For any questions please contact security@refboost.io. Charles Baldet, CEO — GETALEAD SAS.

### 5.2 CNIL Breach Notification (RGPD Article 33)

> Subject: Notification de violation de données personnelles — RefBoost (GETALEAD SAS)
>
> En application de l'article 33 du RGPD, GETALEAD SAS notifie une violation de données personnelles détectée le [DATE] à [HEURE UTC] concernant le service RefBoost. Nature de la violation : [DESCRIPTION]. Catégories et nombre approximatif de personnes concernées : [DETAILS]. Conséquences probables : [IMPACT]. Mesures prises ou envisagées : [MESURES]. Contact DPO : dpo@refboost.io. Charles Baldet, CEO — GETALEAD SAS, Nice, France.

### 5.3 Internal Post-Mortem Template

> **Incident ID**: [ID] — **Severity**: [P1/P2/P3/P4] — **Date**: [DATE]
>
> **Timeline**: [chronological events from detection to resolution].
> **Root cause**: [technical or process root cause].
> **Impact**: [data, customers, duration].
> **Action items**: [list with owner and deadline].
> **CHANGELOG entry**: [one-line summary].

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
