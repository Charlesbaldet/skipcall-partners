# Access Control Policy

| Field | Value |
|---|---|
| Document ID | RB-AC-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This policy defines how identities are managed, how access rights are granted, reviewed and revoked, and which authentication controls are enforced across the RefBoost application and its supporting infrastructure.

## 2. Application Roles (RBAC)

RefBoost implements role-based access control with the following roles:

- **superadmin** — cross-tenant access; reserved to RefBoost staff (currently Charles Baldet only).
- **admin** — full access within a single tenant; manages users, settings and billing for that tenant.
- **commercial** — read/write referrals and commissions within their tenant; cannot change settings or billing.
- **partner** — access limited to their own referrals and commissions.

### 2.1 Access Matrix

| Role | Referrals | Commissions | Partners | Settings | Billing | Audit Logs |
|---|---|---|---|---|---|---|
| superadmin | RW (cross-tenant) | RW (cross-tenant) | RW (cross-tenant) | RW (cross-tenant) | RW (cross-tenant) | R (cross-tenant) |
| admin | RW | RW | RW | RW | RW | R |
| commercial | RW | RW | R | — | — | — |
| partner | R (own) | R (own) | — | — | — | — |

## 3. Infrastructure Access (Humans)

The following platforms hold administrative access to production systems. Today all such accounts are held by **Charles Baldet only**, all secured with 2FA / TOTP:

| Platform | Purpose |
|---|---|
| Railway | Backend hosting, PostgreSQL, env vars |
| Vercel | Frontend hosting, CDN, env vars |
| GitHub | Source code, CI/CD |
| Google Workspace | Internal email, drive, calendar |
| Qonto | Banking / SEPA payments admin |
| Pennylane | Accounting and invoicing admin |
| OVH | DNS management |

## 4. Authentication Policy

- **Token format**: JWT, signed with the server-side secret, with a bounded expiration.
- **Password requirements** (enforced at registration and password change):
  - Minimum 8 characters.
  - At least 1 uppercase letter.
  - At least 1 lowercase letter.
  - At least 1 digit.
  - Blocked against the top-100 most common passwords list.
- **Inactivity timeout**: 30 minutes of inactivity triggers re-authentication.
- **Rate limits** (express-rate-limit):
  - `/auth/login`: 5 attempts per minute per IP.
  - `/auth/forgot-password`: 3 attempts per hour per IP.

## 5. Access Reviews

Access to infrastructure tools is reviewed **quarterly** by the CEO / Security Officer. The review covers:

- Active accounts on each platform listed in section 3.
- 2FA enforcement status.
- Removal of any inactive collaborator or service account.

The review is recorded as a dated note in the internal compliance log.

## 6. Onboarding / Offboarding Checklist

The onboarding and offboarding process is **manual today**, which is recorded as risk **R9** in `risk-assessment.md`. The intended steps are:

### 6.1 Onboarding

- Issue Google Workspace account.
- Enroll the user in 2FA.
- Grant least-privilege access to required infrastructure platforms.
- Create a RefBoost user account with the appropriate RBAC role.
- Acknowledge security policies.

### 6.2 Offboarding

- Revoke RefBoost application account.
- Revoke access on Railway, Vercel, GitHub, Google Workspace, Qonto, Pennylane, OVH.
- Rotate any shared secret the departed person had access to.
- Review and remove any personal device tokens.
- Close the offboarding ticket with all revocation timestamps.

Automation of this checklist is on the roadmap; today the CEO performs each step manually and records the completion date.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
