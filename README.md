# NFRP

**A self-hosted transport operations platform for documents, OCR-assisted imports, fleet workflows and cost control.**

[![Validate](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml/badge.svg)](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)

NFRP turns PDFs, scans and exported files into proposals that an operator can inspect before they become business records.

```text
upload or import → extract → check → human review → confirm → operational record
```

Automation proposes. A person confirms.

> New to servers? Start with the [step-by-step beginner guide](docs/BEGINNER_GUIDE.md). It assumes no prior experience.

## Choose your path

| I want to… | Use this |
|---|---|
| See the product without installing anything | Open the [interactive product tour](https://student13thirteen.github.io/NFRP/) |
| Run the complete application | Follow **Install on a Linux server** below |
| Show a reliable five-minute demo | Run `bash nfrp demo` after installation |
| Understand what is included in this release | Read the [17 August 2026 release snapshot](docs/RELEASE_2026-08-17.md) |

The GitHub Pages experience is an interactive, synthetic product tour. It does not pretend to run OCR or a database in the browser. The complete application uses Next.js, PostgreSQL, Prisma and Docker.

## Install on a Linux server

You need:

- a Linux server or Linux computer;
- Docker Engine running;
- Docker Compose v2 (`docker compose version` must work);
- at least 4 GB of RAM for the base application;
- Git.

You do **not** need Node.js, PostgreSQL or OCR tools on the host. Docker provides them.

### 1. Download NFRP

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
```

### 2. Run the guided setup

```bash
bash nfrp setup
```

Press Enter to accept any suggested default. The setup asks for:

- company and product name;
- administrator email;
- optional logo and colors;
- access mode: this server, local network/reverse proxy, or Cloudflare Tunnel;
- application port.

It then creates private secrets, builds the containers, applies all database migrations, loads synthetic demo records and waits until the application is healthy. At the end it prints the URL, administrator email and generated password.

### 3. Verify and sign in

```bash
bash nfrp doctor
bash nfrp credentials
```

Open the printed URL in a browser and sign in. The generated `.env` file contains the initial credentials, is ignored by Git and is created with permissions `600`.

If anything fails, run:

```bash
bash nfrp status
bash nfrp logs app
```

## Your first ten minutes

1. Sign in and open **Panoramica**.
2. Open **Acquisisci** to see every supported import from one place.
3. Run `bash nfrp demo` in the terminal.
4. Follow the printed path and upload `examples/tolls/demo-tolls.csv`.
5. Review the proposed rows before confirming them.
6. Upload the same file again to see duplicate protection.
7. Open **Autostrade** and **Centro costi** to verify the confirmed result.
8. Open **Impostazioni → Identità aziendale** to change company name, logo and palette.

All records installed by default are synthetic. Do not upload real company documents to a public or disposable demo.

## What the complete application includes

- authenticated, protected operator workspace;
- customer, supplier, driver, tractor, trailer and other-entity registries;
- fiscal and contact fields for customers and suppliers;
- dated driver employment periods and dated tractor-driver assignments;
- document inbox with local OCR, field extraction and human review;
- trip-bill OCR with approximate driver-name suggestions and mandatory operator validation;
- separate fuel-delivery and container-transport workflows;
- fuel, toll, leasing, maintenance, warehouse and expense imports;
- duplicate protection, coherence checks and explicit `PENDING` states;
- recoverable form drafts and idempotent manual fuel/expense submissions;
- reversible toll discard and restore, without discarded rows entering costs or reports;
- split expense-line allocation across vehicles and warehouse items;
- expiring and non-expiring documents, including digital tachograph evidence;
- cross-module cost center and PDF reports;
- optional read-only local assistant backed by Ollama;
- optional Telegram expiry notifications;
- optional automatic document mirroring to Nextcloud;
- runtime company branding without a code fork;
- PostgreSQL migrations, synthetic seed data and clean-room CI.

The public repository mirrors the application behavior as of 17 August 2026 while replacing company-specific data, parser fixtures and identifiers with synthetic equivalents. See the [release boundary](docs/RELEASE_2026-08-17.md) for the exact meaning of parity.

## Everyday commands

Run commands from the cloned `NFRP` directory.

| Command | What it does | Deletes data? |
|---|---|---|
| `bash nfrp start` | Starts or reconciles the app and every enabled optional service | No |
| `bash nfrp stop` | Stops containers and preserves volumes | No |
| `bash nfrp status` | Shows container and health status | No |
| `bash nfrp doctor` | Checks Docker, configuration, health and login protection | No |
| `bash nfrp logs app` | Follows application logs; use `Ctrl+C` to exit | No |
| `bash nfrp backup` | Creates a database dump and uploads archive in the backup volume | No |
| `bash nfrp update` | Creates a safety backup, rebuilds and restarts | No |
| `bash nfrp demo` | Prints and verifies the deterministic demo path | No |
| `bash nfrp credentials` | Prints the local URL and initial administrator login | No |

### Safe update from GitHub

```bash
git pull --ff-only
bash nfrp update
bash nfrp doctor
```

`bash nfrp update` creates a safety backup before rebuilding. For disaster recovery, also copy backups away from the server: a backup stored only on the same machine is not enough.

Do not rerun `bash nfrp setup` over an existing installation unless you intentionally want to replace its configuration. The script asks before replacing `.env` and saves the previous file, but production upgrades should always be tested on a copy first.

## Access modes

- **This server only:** binds to `127.0.0.1`; use it locally or behind a reverse proxy on the same host.
- **LAN / reverse proxy:** binds to `0.0.0.0`; protect the host with a firewall and expose only the intended application endpoint.
- **Cloudflare Tunnel:** uses the optional `cloudflared` container and requires no router port forwarding.

NFRP never publishes the PostgreSQL port on the host.

For network details, cookies and upgrades, read [Server setup](docs/SETUP.md).

## Optional integrations

The base application works without external services. Enable integrations only after the core installation passes `bash nfrp doctor`.

- **Nextcloud:** mirrors new or changed PDFs through WebDAV and moves them when their application status changes.
- **Telegram:** sends scheduled document-expiry notifications.
- **Ollama:** powers the optional read-only NFRP Bot with a local model.

The exact variables, start commands, folder semantics and safety notes are in [Optional integrations](docs/INTEGRATIONS.md). Once an integration flag is enabled in `.env`, `bash nfrp start` automatically includes the required Docker Compose profile.

## Branding

During setup—or later from **Impostazioni → Identità aziendale**—an administrator can change the company name, product name, subtitle, logo and interface palette. Branding is stored as configuration and uploaded data, not hard-coded into the app. See [Branding](docs/BRANDING.md).

## Development and verification

Application development requires Node.js 20 or later.

```bash
npm ci
npm run prisma:generate
npm run lint
npm run test
npm run build
python3 scripts/validate-public-repo.py
bash scripts/ci_smoke.sh
```

The clean-room check builds the real Docker image, starts an empty PostgreSQL database, applies every migration, seeds synthetic records, verifies branding and performs an authenticated login over HTTP.

## Security and data boundary

This repository contains no production database, uploads, backups, `.env`, credentials, private endpoints or operational company records. All public companies, people, plates, fiscal identifiers and documents are synthetic.

Before using NFRP with real data, review [SECURITY.md](SECURITY.md). The project is a self-hosted reference implementation, not a hardened multi-tenant SaaS. In particular, review access control, reverse-proxy headers, rate limiting, restore procedures and off-site backups for your environment.

## Documentation map

- [Beginner guide](docs/BEGINNER_GUIDE.md)
- [Server setup](docs/SETUP.md)
- [Five-minute demo](docs/DEMO.md)
- [Optional integrations](docs/INTEGRATIONS.md)
- [Company branding](docs/BRANDING.md)
- [17 August 2026 release snapshot](docs/RELEASE_2026-08-17.md)
- [Security model and limits](SECURITY.md)
- [Product origin](docs/PRODUCT_ORIGIN.md)
- [Platform vision](docs/ERP_PLATFORM_VISION.md)

## Project scope and license

NFRP is an AI-assisted, operator-directed project developed around real operational requirements. It does not claim that every line was written manually, nor that one configuration fits every company without review.

Source code is available under the [MIT License](LICENSE). All included scenarios and data are synthetic.
