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
- discarded toll rows are retained as `DISCARDED`, excluded from accounting/reporting and explicitly restorable;
- manual fuel and expense writes are transactional and idempotent for an identical submission payload;
- the cost center excludes drafts and unposted rows;
- fuel-distribution trips and container trips remain distinct domains;
- maintenance has one manual entry and one register: any maintenance is stored as an expense document with one or more lines, while pre-unification maintenance cards stay readable and editable and are listed in the same register;
- expense unit prices keep thousandth precision, each allocation carries its own dated but editable driver, and a posted document accepts later text and PDF completion but never amount, quantity or allocation changes;
- OCR driver names are suggestions: approximate matching may prefill an existing driver, but the review selection is authoritative and no driver is created implicitly;
- dated tractor-driver assignments drive historical attribution, while driver employment periods remain a separate registry;
- motor vehicles and trailers use explicit operational classifications, and externally owned fleet records link to a reusable owner registry;
- road fines and road accidents are distinct traceable registers with explicit status/responsibility, vehicle and driver links, deadlines, costs and authenticated attachments;
- road fine PDFs are read into `TO_REVIEW` drafts that stay outside the cost center: the parser proposes only the fields the document proves, re-sending a file is recognized by fingerprint, and leaving review requires the mandatory fields plus an explicit human confirmation;
- container waybills are acquired from PDF and from JPG, PNG and WebP photographs validated by binary signature; acquisition creates no master data, links only existing records and leaves every row `PENDING`;
- registries open on the list: search runs in the browser over the loaded rows, creation lives on its own page, and the three fleet registries always show the working unit of driver, motor vehicle and trailer;
- the driver of a vehicle is never inferred: it comes from the dated assignment covering the current `Europe/Rome` day, and a trailer shows the driver of its paired motor vehicle;
- paginated registers preserve the selected page size and active filters across navigation and filter submissions;
- a document type may explicitly have no expiry date;
- the assistant uses a whitelist of read-only Prisma queries and never executes arbitrary SQL.

## Modules

Customer and supplier master data, driver employment, classified fleet and external ownership, document archive, OCR inbox, trips, fuel, tolls, maintenance and split expenses, leasing, road fines, road accidents, warehouse, cost center, notifications, document mirror and local assistant. Some integrations are intentionally disabled in the demo profile.

## Public parity boundary — 28 August 2026

The public tree mirrors the identified code-level workflows of the operational transport vertical as of 28 August 2026. Company records, production documents, credentials, endpoints, branding and provider-specific regression data are deliberately absent. Parser fixtures and registry examples are synthetic equivalents, so this is behavioral parity rather than a byte-for-byte production export. The road-fine parser and the photographed-waybill extraction ship with synthetic fixtures only: their behaviour on real documents was verified in the private deployment and cannot be reproduced from this repository. See `docs/RELEASE_2026-08-28.md` for the current scope and evidence, and `docs/RELEASE_2026-08-25.md` for the previous boundary.

## Startup and security

Use only the isolated database created by the Compose project in this directory. Copy `.env.example` to `.env`, replace the credentials before any exposure and never import real documents into the public demo. Known limitations are documented in `SECURITY.md`.

## Verification scope

Release verification must include `npm run lint`, `npm run test`, `npm run build`, `prisma validate` and `docker compose config --quiet`. Point-in-time results belong in CI and the relevant technical report rather than in this context file.
