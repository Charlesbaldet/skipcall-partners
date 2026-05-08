# Risk Assessment and Risk Register

| Field | Value |
|---|---|
| Document ID | RB-RISK-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This document records the information security risks identified for the RefBoost platform, the qualitative assessment of those risks, the mitigations in place, and their residual treatment status. It supports the ISMS policy (`ISMS-policy.md`) and is reviewed at least annually or following any significant change in the technical or regulatory environment.

## 2. Methodology

Each risk is rated on two qualitative scales:

- **Probability** — Low / Medium / High — likelihood of occurrence within a 12-month horizon.
- **Impact** — Low / Medium / High / Critical — severity of consequences (data, financial, reputational, regulatory).

The composite **Level** is derived from the matrix probability × impact and expressed as Low, Medium, High or Critical.

**Treatment status**:

- **Treated** — controls are implemented and considered effective.
- **Partial** — controls are partially implemented; further work is planned.
- **In progress** — treatment is actively being deployed.
- **Untreated** — known gap, accepted with documented compensating measures or scheduled for treatment.

## 3. Risk Register

| ID | Risk | Probability | Impact | Level | Mitigation | Status |
|---|---|---|---|---|---|---|
| R1 | Cross-tenant data leak | Low | Critical | High | tenant_id filter on every query, automated isolation tests, exhaustive audit (Tranche 4-5, May 2026) | Treated |
| R2 | SQL injection | Low | Critical | High | Parameterised queries throughout (pg.Pool), audit pass May 2026 | Treated |
| R3 | XSS via user content | Low | High | Medium | DOMPurify sanitisation on all user-generated HTML, CSP headers | Treated |
| R4 | API token compromise (Pennylane / Qonto / CRM) | Low | High | Medium | AES-256-CBC encryption at rest with TOKEN_ENCRYPTION_KEY env var | Treated |
| R5 | Brute-force authentication | Medium | Medium | Medium | express-rate-limit on /auth/login + /auth/forgot-password | Treated |
| R6 | Service unavailability | Low | High | Medium | Railway auto-restart, Vercel CDN failover, /api/health probes — RTO not yet formally tested | Partial |
| R7 | Data loss | Low | High | Medium | Railway daily PostgreSQL backups, soft-delete with 30-day window, point-in-time recovery — quarterly restore test scheduled | Partial |
| R8 | SSRF (server-side request forgery) | Low | Medium | Low | URL validation on outbound webhooks, deny-list for private IP ranges | Treated |
| R9 | Unauthorised access after personnel departure | Low | High | Medium | Process documented but not yet automated (manual revocation today) | Untreated |
| R10 | GDPR non-compliance | Medium | High | High | Cookie consent banner, account deletion (Art. 17), data export (Art. 20), DPA page, privacy policy update — DPA signing process pending with each customer | In progress |

## 4. Treatment Plan

- **R6 (Service unavailability)** — schedule a formal RTO drill in Q3 2026; document recovery times in `business-continuity.md`.
- **R7 (Data loss)** — implement quarterly restore-to-staging tests using `backend/scripts/verify-backup.js`.
- **R9 (Personnel departure)** — design and implement a checklist-driven, partly automated offboarding flow; tracked as a roadmap item to be revisited when headcount grows beyond the founder.
- **R10 (GDPR non-compliance)** — finalise per-customer DPA signing process and surface signed DPAs in the admin dashboard.

## 5. Review Cadence

The risk register is reviewed:

- **Annually** as part of the ISMS review.
- **After any P1 / P2 incident** to incorporate lessons learned.
- **Upon significant architectural changes** (new sub-processor, major feature, regulatory change).

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
