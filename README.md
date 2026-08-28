# NFRP

**A production-shaped transport ERP and public portfolio project: documents and expiries, OCR-assisted imports, trips, fleet, fuel, tolls, maintenance, fines, road accidents, warehouse and cost control.**

[![Validate](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml/badge.svg)](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)

NFRP turns PDFs, scans and exported files into proposals that a person checks before they become business records. It is a real Next.js/PostgreSQL application, not a static UI mock-up: this repository contains its data model, 36 additive migrations, authenticated workflows, local OCR, tests, Docker deployment and clean-room installation check.

```text
upload or import → extract → check → human review → confirm → operational record
```

**Automation proposes. A person confirms.** Drafts and rejected proposals stay outside costs and reports.

This public edition mirrors the functional transport workflows of a working private ERP while replacing company data, credentials, provider-specific fixtures and branding with synthetic equivalents. The architecture and operational rules remain inspectable end to end.

## Why this project is technically meaningful

- **Human-in-the-loop document intelligence:** upload, extraction, confidence/review, validation and explicit commit are separate stages.
- **Operational accounting safety:** imports are designed to be idempotent and incomplete data never becomes authoritative silently.
- **Real domain boundaries:** container trips and fuel-delivery trips stay distinct while shared files, documents, review queues and reporting are reused.
- **Production-oriented delivery:** strict TypeScript, Prisma/PostgreSQL, protected file routes, health checks, Docker Compose, synthetic seed data and an authenticated clean-room smoke test.
- **Configurable identity:** company name, logo and accessible palette are runtime settings, not a customer-specific source-code fork.

This README is both the product overview and the runnable guide. You can open the real application locally without configuring a server, domain or Cloudflare Tunnel.

**Contents**

1. [Try the real application locally](#1-try-the-real-application-locally)
2. [Install it](#2-install-it)
3. [First sign-in](#3-first-sign-in)
4. [Guided demo, ten minutes](#4-guided-demo-ten-minutes)
5. [Using it day by day](#5-using-it-day-by-day)
6. [Rules that keep your data safe](#6-rules-that-keep-your-data-safe)
7. [Everyday commands](#7-everyday-commands)
8. [When something goes wrong](#8-when-something-goes-wrong)
9. [Backups and updates](#9-backups-and-updates)
10. [Optional extras](#10-optional-extras)
11. [For developers](#11-for-developers)
12. [Security, scope and documents](#12-security-scope-and-documents)

---

## 1. Try the real application locally

The recommended evaluation path runs the complete application on your own computer with synthetic data:

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
bash nfrp quickstart
```

`quickstart` generates private local credentials, builds the application and PostgreSQL containers, applies every migration, loads invented demo records and waits for the health check. It binds only to `127.0.0.1`, so it does **not** require a server, public IP, domain, router changes or Cloudflare.

When it finishes, open `http://localhost:3000` and use the credentials printed in the terminal. Print them again at any time with `bash nfrp credentials`.

The first build downloads the required images and can take several minutes. Docker must remain running while you use NFRP.

---

## 2. Install it

### 2.1 What you need

- Windows 11 with Docker Desktop and WSL 2, macOS with Docker Desktop, or Linux with Docker Engine;
- at least 4 GB of RAM available to Docker;
- an internet connection during the first build;
- Docker Compose v2, Git and a Bash terminal.

You do **not** need Node.js, PostgreSQL or OCR tools on the machine. Docker brings them.

Check the three tools first:

```bash
docker --version
docker compose version
git --version
```

On Windows, run the commands from an Ubuntu/WSL 2 terminal with Docker Desktop integration enabled. On Linux, if `docker` answers with a permission error, follow Docker's documented non-root setup; never fix it by loosening file permissions.

### 2.2 Download the project

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
```

Every command in this guide runs from that `NFRP` folder.

### 2.3 Choose the installation path

For an immediate local evaluation:

```bash
bash nfrp quickstart
```

For a customized installation, run the guided installer instead:

```bash
bash nfrp setup
```

The guided installer asks for company identity, administrator email and initial password, palette, optional logo and access mode. The password is hidden while you type it; leave it empty if you prefer a generated strong password. Choose access mode `1` unless you already administer the target network: the application remains local to this computer and no tunnel is started.

Both paths generate the remaining private secrets, build the containers, create the database, apply **every migration**, load synthetic demo records, wait until the application answers as healthy, and finally print the address, administrator email and initial password.

A successful run ends with `Setup complete` and three values:

```text
URL:      http://localhost:3000
Email:    admin@example.com
Password: (generated)
```

Those credentials are also written to `.env` with permissions `600`. That file is ignored by Git — never send it to anyone.

---

## 3. First sign-in

Check the installation, then print the login again if you need it:

```bash
bash nfrp doctor
bash nfrp credentials
```

`doctor` should show `[ok]` on the important lines. Open the printed URL, sign in, and you land on **Panoramica** (the dashboard).

### What is already inside

The installation creates invented records so nothing looks empty on the first day:

| Type | Examples included |
|---|---|
| Drivers | `Mario Rossi`, `Luca Bianchi` |
| Vehicles | Tractor `AB123CD`, trailer `TR456EF` |
| External owner | `Trasporti Demo Partner S.r.l.` |
| Customer | `Cliente Demo S.r.l.` |
| Supplier | `Officina Demo S.r.l.` |
| Category | `Lavaggio` |
| Document types | Insurance, roadworthiness test, tachograph and more |
| Control records | One invented road fine and one invented road accident |

All of it is fictional. Delete it whenever you want, or keep it while you learn.

### The application menus are in Italian

The interface speaks the language of an Italian transport office. Here is the map:

| In the app | Meaning |
|---|---|
| `Panoramica` | Dashboard: what needs attention today |
| `Acquisisci` | Import or upload anything |
| `Viaggi` | Trips |
| `Clienti` | Customers |
| `Documenti` | Documents and expiry dates |
| `Rifornimenti` | Fuel |
| `Pedaggi` | Tolls |
| `Leasing` | Leasing contracts and invoices |
| `Sinistri stradali` | Accident files, deadlines, responsibility, costs and attachments |
| `Verbali` | Road fines, payment state, deadlines, responsibility and attachments |
| `Manutenzioni` | Maintenance, workshop invoices and delivery notes |
| `Magazzino` | Warehouse and parts |
| `Centro costi` | Cost center |
| `Autisti`, `Mezzi a motore`, `Semirimorchi` | Drivers and classified fleet records |
| `Proprietari terzi` | Owners of external tractors and trailers |
| `Impostazioni → Identità aziendale` | Settings → company identity and branding |
| `Da controllare` | Waiting for your check |
| `Conferma` | Confirm: the moment a record becomes real |

---

## 4. Guided demo, ten minutes

The repository ships one invented file, `examples/tolls/demo-tolls.csv`, and everything else in this demo is typed by hand. No real data is involved.

Print the same script in your terminal at any time with:

```bash
bash nfrp demo
```

### Step 1 — Look at the dashboard

Open **Panoramica**. The board shows only what actually needs attention, and each line is a link to the page that solves it. On a fresh installation it is almost empty: that is correct.

### Step 2 — Import a toll file

1. Open **Acquisisci**. Every supported import is on this page, each with its own card and format.
2. Choose the **Pedaggi** card (`CSV`) and open it.
3. Upload `examples/tolls/demo-tolls.csv`.
4. The application parses the file and stops. Nothing is in your costs yet.

### Step 3 — Check before confirming

You are now on the review page. Look at the proposed rows: date, plate, amount, card. Correct anything that looks wrong, then confirm.

This is the rule of the whole product: an import creates **proposals**, marked `PENDING` or `Da controllare`. A person confirms them.

### Step 4 — Try to import the same file twice

Upload `examples/tolls/demo-tolls.csv` again. The application recognises the same source and does not duplicate the rows. Re-sending a file is always safe.

### Step 5 — See the result

Open **Pedaggi**: the confirmed rows are in the register. Open **Centro costi**: the same amounts now appear as costs, with the applied view stated above the totals.

Only confirmed records are there. Drafts and discarded rows stay out.

### Step 6 — Register a maintenance by hand

1. Open **Manutenzioni**, then **Inserisci nuova manutenzione**.
2. There is one entry for every case: the first cost row is already open, so a simple repair is a short form.
3. Fill the date, pick the supplier `Officina Demo S.r.l.`, then complete the first row: description, quantity, unit price (use a dot, e.g. `120.50`), VAT and destination — for example tractor `AB123CD`.
4. The driver is proposed from the assignment valid on that date and stays editable.
5. If you have an invoice with several items, press **Aggiungi riga** and repeat. Same form, same button.
6. Save. The maintenance appears in the single **Manutenzioni** register and, once registered, in **Centro costi**.

Tick **Lascia da controllare prima di registrarla nei costi** if you want it to wait in the review queue instead.

### Step 7 — Add a document with an expiry

1. Open **Documenti → Nuovo documento**.
2. Choose the tractor `AB123CD`, a document type such as insurance, and an expiry date a few days from now.
3. Save, then go back to **Panoramica**: the expiry is now among the things that need attention.

Documents can also arrive as scans through **Acquisisci → Documenti flotta**, where local OCR reads them and proposes the fields for your review.

### Step 8 — Make it yours

Open **Impostazioni → Identità aziendale** and change the company name, the logo or a colour. The interface updates without touching the code.

### Step 9 — Inspect traceable control records

Open **Verbali** and **Sinistri stradali**. The synthetic seed includes one record in each register, linked to the demo tractor and driver. Open the detail pages to see status, deadlines, responsibility, costs and the protected attachment area.

### After the demo

Everything you created is invented and can be deleted from each page. If you prefer to start over completely, reinstall on an empty database — see [Deployment and network setup](docs/SETUP.md).

---

## 5. Using it day by day

A normal working day follows one loop: **acquire → check → confirm → read the numbers**.

| What you want to do | Where to go | What happens |
|---|---|---|
| Import anything at all | `Acquisisci` | One page with every import: fleet documents, container waybills, fuel, tolls, leasing, workshop invoices and delivery notes |
| See what needs you today | `Panoramica` | Only real pending work, each line linking to the page that resolves it |
| Track expiry dates | `Documenti` | Insurance, roadworthiness, tachograph and more, with expiring and expired views; `Storico documenti` keeps the old ones |
| Move a scanned document into records | `Acquisisci → Documenti flotta` | Local OCR proposes the fields; you review and confirm |
| Record fuel | `Rifornimenti` | Import a statement or type an entry; consistency checks flag odd km or consumption |
| Record tolls | `Pedaggi` | Import CSV statements, review, confirm; a wrong file can be discarded and restored |
| Record a repair, a workshop invoice or a parts delivery note | `Manutenzioni` | One entry for all three: one row for a simple job, more rows for an invoice. Everything lands in one register |
| Read a maintenance PDF instead of typing it | `Manutenzioni → Importa manutenzioni da PDF` | Each page becomes one maintenance to check; handwritten plates are never guessed |
| Fix a maintenance you already registered | Open it from `Manutenzioni` | Descriptions, notes and the PDF can be completed later; amounts and allocations stay closed |
| Follow leasing | `Leasing` | Contracts, instalment plan as a forecast, and real invoices linked to the plate |
| Manage road fines | `Verbali` | Payment state, responsibility, deadlines, amounts and authenticated attachments, linked to vehicle and driver |
| Read a road fine PDF instead of typing it | `Verbali → Acquisisci da PDF` | Each notice becomes a draft to check, outside the cost center until you confirm it |
| Manage road accidents | `Sinistri stradali` | Claim state, insurer references, deadlines, damage/cost values and attachments, linked to fleet entities |
| Manage parts and stock | `Magazzino` | Load parts, mount them on a vehicle, and see the movement history |
| Plan and close trips | `Viaggi` | Two separate flows: fuel deliveries and container transports, each with its own data |
| Import container waybills | `Viaggi → Importa bolle container` | PDF or a phone photograph (JPG, PNG, WebP); OCR proposes waybill, plate, customer, terminal and stops, and the pending banner takes you to the review queue |
| See where the money goes | `Centro costi` | Trips, fuel, tolls, leasing, maintenance, documents and warehouse together, with filters and a PDF report |
| Keep registries in order | `Autisti`, `Mezzi a motore`, `Semirimorchi`, `Proprietari terzi`, `Clienti` | Each opens on the full list with instant search and a create button; the three fleet registries also show today's driver, motor vehicle and trailer together |
| Ask a question in plain language | `NFRP Bot` | Optional, read-only, answers from your data — needs the Ollama integration |

Two habits worth keeping:

- **check the review queues before confirming**, especially after an OCR import. `Da controllare` is where mistakes are cheap to fix;
- **type prices with a dot** (`3.312`, `120.50`), the way the app expects them.

---

## 6. Rules that keep your data safe

- an import never writes costs directly: it produces proposals that wait for a person;
- OCR is a suggestion. Ambiguous or handwritten values are left empty on purpose, and no driver, plate or supplier is invented for you;
- re-sending the same file does not duplicate records;
- a confirmed document can be completed with text and a PDF, but its amounts and allocations stay closed;
- discarded toll rows are kept and can be restored; they never enter costs or reports while discarded;
- `bash nfrp stop` never deletes data. Commands containing `down -v`, `volume rm`, `system prune --volumes` or `rm -rf` do — do not run them as a troubleshooting shortcut;
- never upload real company documents to a public or disposable demo, and never commit `.env`, backups or uploads.

---

## 7. Everyday commands

Run them from the `NFRP` folder.

| Command | What it does | Deletes data? |
|---|---|---|
| `bash nfrp quickstart` | Creates a new local demo with safe defaults; refuses to overwrite an existing `.env` | No |
| `bash nfrp start` | Starts the app and every enabled optional service | No |
| `bash nfrp stop` | Stops the containers, keeps the data | No |
| `bash nfrp status` | Shows what is running and healthy | No |
| `bash nfrp doctor` | Checks Docker, configuration, health and login protection | No |
| `bash nfrp logs app` | Follows the application log; `Ctrl+C` to exit | No |
| `bash nfrp credentials` | Prints the URL and the initial administrator login | No |
| `bash nfrp demo` | Prints and verifies the demo path | No |
| `bash nfrp backup` | Creates a database dump and an uploads archive | No |
| `bash nfrp update` | Takes a safety backup, rebuilds and restarts | No |

---

## 8. When something goes wrong

**The page does not open.**

```bash
bash nfrp status
bash nfrp doctor
```

If it is stopped, run `bash nfrp start`.

**The application container is unhealthy.**

```bash
bash nfrp logs app
```

Read the last error and press `Ctrl+C` to stop watching. Do not delete volumes to "reset" it.

**The port is already in use.** On a brand-new local demo, run `NFRP_QUICKSTART_PORT=3001 bash nfrp quickstart`. With the guided installer, choose another port when asked. On an existing installation, edit `APP_PORT` and `APP_PUBLIC_URL` in `.env`, then run `bash nfrp start` and `bash nfrp doctor`.

**You lost the password.** Run `bash nfrp credentials`.

**An import produced something wrong.** Do not correct it in the database. Use the review queue: discard or fix the proposal there, then import again — duplicates are prevented.

**`git pull --ff-only` refuses to update.** Run `git status` and look at your local changes before doing anything else. Do not discard work you do not recognise.

---

## 9. Backups and updates

```bash
bash nfrp backup
```

The backup contains a database dump and the uploaded files. **Copy it to another machine or storage service**: a backup that lives only on the same server does not protect you from losing that server.

To update:

```bash
git pull --ff-only
bash nfrp update
bash nfrp doctor
```

`bash nfrp update` takes a safety backup before rebuilding. Do not run `bash nfrp setup` again just to update an existing installation, and test a production upgrade on a copy first.

---

## 10. Optional extras

The local application works without any of these. They are optional administrator features, not requirements for trying NFRP. Enable one at a time, and only after `bash nfrp doctor` passes.

- **Nextcloud** — mirrors new or changed PDFs through WebDAV and moves them when their status changes;
- **Telegram** — sends scheduled expiry notifications;
- **Ollama** — powers the read-only `NFRP Bot` with a local model;
- **Cloudflare Tunnel** — publishes the application without opening router ports.

Variables, commands and safety notes: [Optional integrations](docs/INTEGRATIONS.md).

**Access modes**, chosen only in the guided setup: local computer (`127.0.0.1`), LAN/reverse proxy (`0.0.0.0`, for administrators), or optional Cloudflare Tunnel. `quickstart` always chooses local access. PostgreSQL is never published on the host. Details in [Deployment and network setup](docs/SETUP.md).

**Branding**: company name, product name, subtitle, logo and palette are configuration, not code. Change them during setup or later from `Impostazioni → Identità aziendale`. See [Branding](docs/BRANDING.md).

---

## 11. For developers

Node.js 20 LTS for direct development. End users only need Docker.

```bash
npm ci
npm run prisma:generate
npm run lint
npm run test
npm run build
python3 scripts/validate-public-repo.py
bash scripts/ci_smoke.sh
```

The clean-room check builds the real Docker image, starts an empty PostgreSQL database, applies every migration, seeds synthetic records, verifies branding and performs an authenticated login over HTTP. The same suite runs in CI on every pull request.

Stack: Next.js 16 App Router, React 19, strict TypeScript, Prisma 5, PostgreSQL 16, Docker Compose, and local OCR through OCRmyPDF, Tesseract, pikepdf, Ghostscript and Pillow.

---

## 12. Security, scope and documents

This repository contains no production database, uploads, backups, `.env`, credentials, private endpoints or company records. Every company, person, plate, fiscal identifier and document in it is invented.

Before using NFRP with real data, read [SECURITY.md](SECURITY.md). This is a self-hosted reference implementation, not a hardened multi-tenant SaaS: review access control, reverse-proxy headers, rate limiting, restore procedures and off-site backups for your own environment.

### Documentation

| Document | When to read it |
|---|---|
| [Beginner guide](docs/BEGINNER_GUIDE.md) | You want to run the real application locally without administering a server |
| [Deployment and network setup](docs/SETUP.md) | Local quickstart, network access, cookies, reverse proxy, upgrades |
| [Demo script](docs/DEMO.md) | You need to show the product to someone |
| [Optional integrations](docs/INTEGRATIONS.md) | Nextcloud, Telegram, Ollama, Cloudflare |
| [Company branding](docs/BRANDING.md) | Name, logo, palette |
| [Security model and limits](SECURITY.md) | Before real data |
| [Product origin](docs/PRODUCT_ORIGIN.md) and [platform vision](docs/ERP_PLATFORM_VISION.md) | Where the project comes from and where it is going |
| [Latest synchronization](docs/RELEASE_2026-08-28.md) | What changed, how it was verified and what public parity does and does not mean |

NFRP is an AI-assisted, operator-directed project built around real operational requirements. It does not claim that every line was written by hand, nor that one configuration fits every company without review.

Source code under the [MIT License](LICENSE). All included scenarios and data are synthetic.
