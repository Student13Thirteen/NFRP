# NFRP Portfolio Edition — application context

## Purpose

NFRP is a modular monolith for the operational processes of a transport SME. This Portfolio Edition preserves meaningful architecture, workflows and tests, while using only synthetic configuration and data. The web database remains the source of truth; imports and OCR produce reviewable proposals.

## Stack

- Next.js 16 App Router, React 19 and strict TypeScript;
- Prisma 5 and PostgreSQL 16;
- HMAC-signed sessions stored in `HttpOnly`, `SameSite=Lax` cookies;
- Docker Compose for the application and database;
- local OCR through OCRmyPDF, Tesseract, pikepdf, Ghostscript and Pillow when installed;
- optional Ollama integration for the read-only assistant.

## Functional rules

- operational routes require authentication both at the proxy boundary and in server-side code;
- files are stored outside `public/` and served only through authenticated routes;
- financial imports and OCR results remain `PENDING` until a person explicitly confirms them;
- source keys, hashes and Prisma constraints reduce duplicate records;
- the cost center excludes drafts and unposted rows;
- fuel-distribution trips and container trips remain distinct domains;
- the assistant uses a whitelist of read-only Prisma queries and never executes arbitrary SQL.

## Modules

Master data and fleet, document archive, OCR inbox, trips, fuel, tolls, maintenance and expenses, leasing, warehouse, cost center, notifications, document mirror and local assistant. Some integrations are intentionally disabled in the demo profile.

## Startup and security

Use only the isolated database created by the Compose project in this directory. Copy `.env.example` to `.env`, replace the credentials before any exposure and never import real documents into the public demo. Known limitations are documented in `SECURITY.md`.

## Verification scope

Release verification must include `npm run lint`, `npm run test`, `npm run build`, `prisma validate` and `docker compose config --quiet`. Point-in-time results belong in CI and the relevant technical report rather than in this context file.
