# GDPR Article 30 — Record of Processing Activities

| Field | Value |
|---|---|
| Document ID | RB-GDPR-001 |
| Owner | Data Protection Officer — dpo@refboost.io |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Controller and Contact

- **Controller**: GETALEAD SAS (operating RefBoost) — Nice, France.
- **Contact**: dpo@refboost.io
- **Data Protection Officer**: dpo@refboost.io

This record is maintained in accordance with Article 30 of Regulation (EU) 2016/679 (RGPD).

## 2. Processing Activities

| Activity | Purpose | Legal basis | Data subjects | Data categories | Recipients | Retention |
|---|---|---|---|---|---|---|
| User accounts | Provide SaaS access to admins / commercials / partners | Contract (Art. 6.1.b) | Customer staff, partners | Email, full name, password hash, role | None (internal) | Contract duration + 3 years |
| Referrals / leads | Track partner referrals and lead status | Contract (Art. 6.1.b) | Prospects | Name, email, phone, company, deal_value, status | Customer's CRM (HubSpot/Salesforce/Notion) on connection | Contract duration + 3 years |
| Commissions / payments | Compute and pay partner commissions | Contract + legal accounting obligation (Art. 6.1.b + 6.1.c) | Partners | Name, IBAN, VAT number, amounts | Qonto, Pennylane | 10 years (French accounting obligation) |
| Internal messaging | Customer ↔ partner communications | Contract (Art. 6.1.b) | Customer staff, partners | Message content, attachments | None | Contract duration + 1 year |
| Web analytics (GA4) | Audience analysis on landing pages | Consent (Art. 6.1.a) | Site visitors | Anonymised IP, page views, referrer | Google | 14 months (GA4 default) |
| Transactional emails | Notifications, invitations, password resets | Legitimate interest (Art. 6.1.f) | Customer staff, partners | Email address, message content | Resend | 90 days (logs) |
| Public marketplace | Display partner programmes for prospects | Legitimate interest (Art. 6.1.f) | Customer companies | Company name, description, logo, public profile | Site visitors | While published |

## 3. Sub-Processors

The full sub-processor register is maintained in `supplier-register.md`. Recipients listed above correspond to entries in that register.

## 4. International Transfers

Transfers of personal data outside the EEA are limited to sub-processors operating in the United States (Vercel, Resend, GitHub, Google, parts of). These transfers rely on the **EU–US Data Privacy Framework** and the **Standard Contractual Clauses** as included in the relevant DPAs.

## 5. Data Subject Rights

In accordance with Articles 15 to 22 RGPD, data subjects can exercise the following rights at any time:

- **Right of access** (Art. 15) — obtain a copy of personal data held.
- **Right to rectification** (Art. 16) — correct inaccurate or incomplete data.
- **Right to erasure** (Art. 17) — request deletion (implemented in-app via account deletion).
- **Right to data portability** (Art. 20) — receive personal data in a structured, machine-readable format (implemented in-app via data export).
- **Right to object** (Art. 21) — oppose processing based on legitimate interest.
- **Right to restrict processing** (Art. 18).

Requests are exercised through **dpo@refboost.io** and are handled within the timeframe required by the RGPD (one month, extendable by two months for complex cases). Complaints can also be lodged with the **CNIL** (Commission Nationale de l'Informatique et des Libertés).

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
