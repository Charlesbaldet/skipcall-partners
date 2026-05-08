# skipcall-partners
Skipcall Partner Referral Management Platform.

## Branch protection

The `main` branch should have the following protections in place:

- Required PR reviews (when team grows beyond solo)
- All CI checks must pass before merge (`backend-lint`, `frontend-build`, `security-check` — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
- No force pushes
- No direct pushes (PRs only, once team grows)

Until the team grows, solo direct pushes to `main` are accepted but require local CI to pass before push:

```bash
cd backend && node -c server.js && npm audit --audit-level=high
cd frontend && npx vite build && npm audit --audit-level=high
```

## Security

- See [`SECURITY.md`](SECURITY.md) for the vulnerability disclosure policy.
- See [`CHANGELOG.md`](CHANGELOG.md) for the security-relevant change log.
- Public security overview: <https://refboost.io/security>.
