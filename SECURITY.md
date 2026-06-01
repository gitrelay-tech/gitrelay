# Security Policy

## Supported versions

GitRelay is actively developed; security fixes target the latest `main`.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, email **security@gitrelay.xyz** with:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected route(s) or component(s)

We aim to acknowledge reports within **72 hours** and to ship a fix or mitigation
as quickly as the severity warrants. We'll credit you in the release notes unless
you prefer to stay anonymous.

## Scope notes

- API keys and secrets live in `.env.local` and are **never** committed.
- `VIEWS_IP_SALT` is required in production; the app refuses to boot without it.
- Admin maintenance routes under `/api/admin/*` are gated by `ADMIN_SECRET`.

Thank you for helping keep GitRelay and its users safe. 🔒
