# Information Security Management System (ISMS) Policy

| Field | Value |
|---|---|
| Document ID | RB-ISMS-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose and Scope

### 1.1 Purpose

This Information Security Management System (ISMS) policy defines the principles, objectives, roles and operational requirements that govern the protection of information assets handled by GETALEAD SAS in the operation of the RefBoost SaaS platform. It is the top-level reference for all subsidiary security, privacy and operational policies maintained under `docs/compliance/`.

### 1.2 Scope

The ISMS applies to:

- The **RefBoost SaaS application** (frontend, backend API, PostgreSQL database, background workers).
- The **hosting infrastructure**: Vercel (frontend, CDN) and Railway (backend, PostgreSQL — EU West region).
- The **source control and CI/CD pipeline** hosted on GitHub.
- The **internal collaboration tooling**: Google Workspace (email, drive, calendar) used for internal communications and document storage.
- All employees, contractors and third parties acting on behalf of GETALEAD SAS who handle RefBoost information assets.

Out of scope: customer-side systems beyond the data exchanged with RefBoost APIs and personal devices not used for production access.

## 2. Security Objectives

GETALEAD SAS commits to the following measurable security objectives for RefBoost:

1. **Zero cross-tenant data leak** — verified through automated isolation tests on every release and an exhaustive multi-tenant audit run prior to each major version.
2. **99.9% application uptime** — measured at the application layer (`/api/health` probes) and at the CDN edge.
3. **Incident response within 4 hours** for high-severity (P2) events and within 1 hour for critical (P1) events, per the incident response plan.
4. **Encryption at rest** (AES-256) for all credentials, API tokens and other Confidential data; **encryption in transit** using TLS 1.3 for all external communications.
5. **Continuous GDPR and ePrivacy compliance** — including lawful processing, data subject rights handling, cookie consent, and a maintained Article 30 record.

## 3. Roles and Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| CEO / Security Officer | Charles Baldet | Overall accountability for the ISMS; final approver of all compliance policies; sign-off on risk treatment. |
| Data Protection Officer (DPO) | dpo@refboost.io | GDPR oversight; data subject rights; CNIL liaison; sub-processor due diligence. |
| Security incident contact | security@refboost.io | First responder for inbound vulnerability disclosure and incident reports. |
| Engineering team | All contributors | Secure coding, code review, deployment, on-call rotation, adherence to change management. |
| Sub-processors | Listed in `supplier-register.md` | Compliance with contractual DPAs and security commitments. |

## 4. Policy Framework

The following subsidiary documents implement this ISMS:

- `risk-assessment.md` — risk register and treatment plan
- `incident-response.md` — incident response plan
- `data-classification.md` — data classification policy
- `access-control.md` — access control policy
- `change-management.md` — change management policy
- `business-continuity.md` — business continuity plan
- `supplier-register.md` — sub-processor register
- `gdpr-record.md` — GDPR Article 30 record of processing activities

## 5. Annual Review and Continual Improvement

This policy and all subsidiary documents are reviewed at least once every 12 months. The next review of this document is due **2027-05-08**.

The ISMS is operated under a continual improvement model:

- Findings from incidents, audits, customer feedback and regulatory updates feed back into risk assessment.
- Risk treatments and policies are updated, version-bumped and re-approved by the CEO.
- Lessons learned are documented in `CHANGELOG.md` and, when applicable, in post-mortem entries.

GETALEAD SAS is committed to the ongoing maturity of its security posture as the company and customer base grow.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
