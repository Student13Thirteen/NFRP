# NFRP

**A self-hosted operations platform that turns documents and exports into reviewable, traceable business workflows.**

NFRP is the first concrete vertical produced from a broader idea: build a reusable operational core, then adapt it to the workflows of a specific small business. The reference implementation focuses on transport operations, where documents, trips, fuel, tolls, leasing, maintenance, warehouse movements and cost control must remain connected.

The core principle is simple:

```text
import or upload
      ↓
parse and validate
      ↓
create a PENDING proposal
      ↓
human review
      ↓
explicit confirmation
      ↓
operational record and cost center
```

Automation proposes; a person confirms.

## One guided server setup

Prerequisites: a Linux server with Docker Engine and Docker Compose v2.

```bash
git clone https://github.com/Student13Thirteen/nfrp.git
cd nfrp
bash nfrp setup
```

The setup asks for:

- company and product name;
- administrator email;
- optional company logo;
- primary, sidebar and accent colors;
- local, LAN/reverse-proxy or Cloudflare Tunnel access;
- application port.

It then generates strong secrets, validates Compose, builds the application, runs migrations, creates the administrator and synthetic demo data, imports the optional logo, waits for a verified health response and prints the login details. The command does not report success when the application is unhealthy.

```bash
bash nfrp doctor
bash nfrp demo
```

## Operations CLI

| Command | Purpose |
|---|---|
| `bash nfrp setup` | guided installation and branding |
| `bash nfrp start` | start or reconcile the stack |
| `bash nfrp stop` | stop containers without deleting data |
| `bash nfrp status` | show services and health |
| `bash nfrp doctor` | verify Docker, configuration, runtime and auth boundary |
| `bash nfrp logs app` | follow one service log |
| `bash nfrp backup` | PostgreSQL dump plus uploaded-file archive |
| `bash nfrp update` | backup, rebuild and restart |
| `bash nfrp demo` | verify and print the five-minute demo path |
| `bash nfrp credentials` | show the locally stored initial login |

## Runtime company branding

The same codebase can be adapted without a fork. During setup—or later from **Settings → Company identity**—an administrator can change:

- company name;
- product name and subtitle;
- company logo;
- primary and dark-primary colors;
- sidebar color;
- positive accent color.

Branding is stored as configuration and uploaded data, not hard-coded into the application. See [`docs/BRANDING.md`](docs/BRANDING.md).

## What the reference vertical includes

- signed-session authentication and protected application boundary;
- driver, tractor, trailer and related-entity registries;
- document inbox, local OCR and review flows;
- controlled imports for trips, fuel, tolls, expenses and leasing;
- deterministic parsing, deduplication and coherence checks;
- human-confirmed `PENDING` workflows;
- maintenance and warehouse operations;
- cross-module cost center and PDF reports;
- optional read-only local assistant with whitelisted tools;
- optional Telegram and Nextcloud workers;
- PostgreSQL, Prisma migrations, Docker Compose and synthetic seed data;
- Vitest, ESLint, production build and repository safety checks.

## Five-minute demo

```bash
bash nfrp demo
```

The flagship demo uses [`examples/tolls/demo-tolls.csv`](examples/tolls/demo-tolls.csv):

1. upload the synthetic CSV from **Acquire → Tolls**;
2. inspect parsed `PENDING` rows and plate matching;
3. upload the same file again to demonstrate deduplication;
4. review and explicitly confirm the rows;
5. verify the result in **Tolls** and **Cost center**;
6. change company name, logo and palette from **Settings → Company identity**.

## Access modes

- **Local:** bound to `127.0.0.1`.
- **LAN / reverse proxy:** bound to `0.0.0.0`; the operator supplies the public URL.
- **Cloudflare Tunnel:** no router port forwarding; setup enables the optional `cloudflared` Compose profile using a locally stored tunnel token.

NFRP does not expose PostgreSQL on a host port.

## Development and verification

```bash
npm ci
npm run lint
npm run test
npm run build
bash -n nfrp
ENV_FILE=.env.example docker compose --env-file .env.example config --quiet
python3 scripts/validate-public-repo.py
bash scripts/ci_smoke.sh
```

The repository contains only synthetic examples. It excludes production databases, uploads, backups, logs, credentials, operational endpoints and company records.

The CI clean-room job also builds the real Docker image from an empty workspace, migrates PostgreSQL, seeds synthetic records, verifies setup-time branding and logo import, checks the anonymous redirect boundary, and completes an authenticated administrator login over local HTTP. The Cloudflare profile is validated separately without storing an operational tunnel token.


## Scope and honesty

NFRP is an AI-assisted project. The product requirements, workflows, deployment choices, integrations, testing, troubleshooting, documentation and iterative verification were directed around real operational needs. The repository does not claim that every line was written manually or without assistance.

It is a self-hosted reference implementation and portfolio project—not a generic multi-tenant SaaS, a high-availability enterprise platform or a guarantee of suitability for every business without review.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) — deployment and access modes;
- [`docs/DEMO.md`](docs/DEMO.md) — deterministic demonstration workflow;
- [`docs/BRANDING.md`](docs/BRANDING.md) — company identity and logo boundary;
- [`docs/PRODUCT_ORIGIN.md`](docs/PRODUCT_ORIGIN.md) — relationship with the earlier modular-platform exploration;
- [`docs/ERP_PLATFORM_VISION.md`](docs/ERP_PLATFORM_VISION.md) — longer-term core-plus-vertical thesis;
- [`SECURITY.md`](SECURITY.md) — security model and known limits.

## License

MIT for the source files in this repository. All included companies, people, identifiers, documents and scenarios are synthetic.
