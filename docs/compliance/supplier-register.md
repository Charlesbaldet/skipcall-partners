# Sub-Processor Register

| Field | Value |
|---|---|
| Document ID | RB-SUP-001 |
| Owner | Charles Baldet, CEO / Security Officer |
| Version | 1.0 |
| Date | 2026-05-08 |
| Next review | 2027-05-08 |
| Approver | Charles Baldet, CEO, GETALEAD SAS |

## 1. Purpose

This register lists the third-party sub-processors used to operate RefBoost, the data they process, the regions in which they operate, their security certifications and the status of the data processing agreements (DPAs) in place with GETALEAD SAS.

## 2. Sub-Processor Table

| Provider | Service | Region | Certifications | Data categories | DPA status |
|---|---|---|---|---|---|
| Vercel | Frontend hosting + CDN | USA / EU Edge | SOC 2 Type II, ISO 27001 | Public assets, request metadata | Signed (Vercel DPA) |
| Railway | Backend + PostgreSQL hosting | EU West | SOC 2 Type II | All application data (Confidential + Restricted) | Signed (Railway DPA) |
| Resend | Transactional emails | USA | SOC 2 Type II | User emails, names | Signed |
| Qonto | SEPA payments | France | ACPR-regulated | Bank info, payment instructions | Signed |
| Pennylane | Accounting / invoicing | France | French accounting authority | Invoices, customer billing info | Signed |
| GitHub | Source code, CI | USA | SOC 2 Type II, ISO 27001 | Source code (no production data) | Signed (Microsoft DPA) |
| Google | Workspace + Analytics 4 | USA / EU | ISO 27001, SOC 2 | Internal email, GA4 user behaviour (post-consent only) | Signed |
| OVH | DNS | France | ISO 27001 | DNS records | Signed |

## 3. Provider Notes

### 3.1 Vercel

Vercel hosts the RefBoost frontend and serves it through its global CDN. Vercel processes public marketing assets and authenticated SaaS pages, plus request-level metadata (IP address, headers) needed for delivery and edge security. No application data persists on Vercel.

### 3.2 Railway

Railway hosts the backend API and the production PostgreSQL database in the EU West region. As such, it processes the full set of application data, including Confidential (encrypted at rest) and Restricted categories. Railway is the most data-sensitive sub-processor in the architecture.

### 3.3 Resend

Resend delivers transactional emails such as invitations, notifications and password resets. It processes the recipient email address, the sender name and the message content for the time required to deliver the email, plus 90-day delivery logs.

### 3.4 Qonto

Qonto is the regulated French payment service provider used by GETALEAD SAS for SEPA partner commission payouts. It processes IBANs, beneficiary names, payment amounts and references. Qonto is supervised by the ACPR.

### 3.5 Pennylane

Pennylane is the accounting platform used by GETALEAD SAS for invoicing customers and meeting French accounting obligations. It processes customer billing identity, VAT numbers and invoice line items, retained for the legal 10-year period.

### 3.6 GitHub

GitHub hosts the RefBoost source code and runs the CI workflows. It does not hold production customer data; access controls and 2FA are enforced for all collaborators.

### 3.7 Google (Workspace + Analytics 4)

Google Workspace provides internal email, drive and calendar to GETALEAD SAS staff. Google Analytics 4 is loaded on the public marketing site **only after explicit consent** through the cookie banner; it processes anonymised IP, page views and referrer.

### 3.8 OVH

OVH manages the DNS records for the `refboost.io` domain and any associated apex / subdomains. It does not process customer personal data; only the DNS configuration owned by GETALEAD SAS.

## 4. Onboarding a New Sub-Processor

Before a new sub-processor is engaged:

- Security and compliance posture is reviewed (certifications, region, DPA terms).
- A DPA is signed.
- This register is updated with the new entry.
- Customers are notified per the privacy policy commitments where required.

---

Approved by: Charles Baldet, CEO — GETALEAD SAS — Nice, France — 2026-05-08
