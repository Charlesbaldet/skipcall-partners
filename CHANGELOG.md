# Changelog

## [Security] — 2026-05-07

### Fixed
- Multi-tenant isolation on messages, news, notifications (Tranche 4-5)
- API token exposure in tenant list response (C1)
- Cross-tenant partner deletion bypass (C2)
- SSRF via CRM webhook test (C3)
- Mollie webhook tenant scoping (H1)
- Invoice download cross-tenant access (H2)
- XSS via blog content and avatar fallback (H4, H5)
- Rate limiting on password reset (H6)

### Added
- CSP headers
- SQL injection defense (parameterized queries audit)
- SVG upload blocking
- Invoice upload size limit
- Notes field length limit
- Database indexes for performance
- Connection pool optimization
