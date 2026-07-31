# Release verification

NFRP is validated as a public, synthetic-data reference implementation.

## Demo gate

The repository CI verifies:

- repository sanitization and forbidden-pattern checks;
- Bash syntax and Docker Compose configuration;
- dependency installation, Prisma schema, lint, tests and production build;
- a clean-room Docker deployment with PostgreSQL migrations and synthetic seed data;
- setup-time company branding and logo import;
- the anonymous authentication boundary and an authenticated administrator login.

Cloudflare Tunnel configuration is validated without embedding a real tunnel token. A live public deployment requires the operator's own domain and credentials.
