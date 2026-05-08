# Data Classification Policy

| Field | Value |
|---|---|
| Document ID | RB-DC-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This policy defines how data handled by RefBoost is classified, stored, transmitted, retained and destroyed. The objective is to apply controls proportionate to the sensitivity of each data category and to make handling rules explicit for engineering, support and any future hires.

## 2. Classification Levels

RefBoost uses four classification levels.

### 2.1 Confidential

Data whose disclosure would cause severe harm to customers, partners or GETALEAD SAS.

- **Examples**: API tokens (Pennylane, Qonto, CRM connectors), password hashes, IBANs, encryption keys, OAuth refresh tokens.
- **Controls**:
  - Encrypted at rest with **AES-256** (column-level via `TOKEN_ENCRYPTION_KEY`).
  - Restricted access — superadmin and the runtime service role only.
  - **Never** logged in clear text.
  - Not transmitted to third parties beyond the strictly necessary sub-processor.

### 2.2 Restricted

Personal data and business-sensitive information whose disclosure would harm customers or partners.

- **Examples**: customer staff emails, full names, commission amounts, referral details, VAT numbers, internal messages between customers and partners.
- **Controls**:
  - **TLS 1.3** in transit for all communications.
  - Authenticated access required (JWT).
  - **tenant_id** isolation enforced on every query.

### 2.3 Internal

Operational data that supports the running of the service.

- **Examples**: application logs (with PII redacted), metrics, health probe results, configuration data.
- **Controls**:
  - Authenticated access (admin / superadmin).
  - **No PII** is intentionally placed inside Internal data; structured logging redacts known PII fields.

### 2.4 Public

Information explicitly published.

- **Examples**: marketing site, blog posts, public marketplace listings, the `/security` page, the `/status` page.
- **Controls**: none required.

## 3. Handling Matrix

| Level | Storage | Transmission | Retention |
|---|---|---|---|
| Confidential | PostgreSQL with AES-256-CBC column encryption; secret managers (Railway / Vercel env vars) | TLS 1.3 only; never via email or chat | Lifetime of the integration; rotated on suspicion of compromise |
| Restricted | PostgreSQL with tenant_id isolation; soft-delete with 30-day window | TLS 1.3 only; authenticated APIs | Per `gdpr-record.md` retention schedule |
| Internal | Railway logs; structured logging pipeline | TLS within the platform | 90 days for application logs |
| Public | Vercel CDN; GitHub repo (where applicable) | HTTPS | While published |

## 4. Examples by Data Type

| Data | Classification |
|---|---|
| Pennylane / Qonto / CRM API tokens | Confidential |
| Bcrypt password hashes | Confidential |
| Partner IBANs | Confidential |
| `TOKEN_ENCRYPTION_KEY`, JWT secret | Confidential |
| Customer staff email and full name | Restricted |
| Referral lead details (prospect name, email, phone, deal value) | Restricted |
| Commission amounts and payment status | Restricted |
| Internal messages between users | Restricted |
| VAT numbers | Restricted |
| Application logs (PII-redacted) | Internal |
| `/api/health` output | Internal |
| `/security` page content | Public |
| Marketplace public listings | Public |

## 5. Destruction

When data reaches the end of its retention period or following a deletion request:

- Confidential and Restricted data are deleted from the live database; soft-deleted rows are purged after 30 days.
- Backups containing deleted data age out of the 7-day point-in-time recovery window automatically.
- Logs are rotated and deleted after 90 days.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
