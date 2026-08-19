# NFRP

**A self-hosted transport operations platform: documents and expiries, OCR-assisted imports, trips, fuel, tolls, maintenance, warehouse and cost control.**

[![Validate](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml/badge.svg)](https://github.com/Student13Thirteen/NFRP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)

NFRP turns PDFs, scans and exported files into proposals that a person checks before they become business records.

```text
upload or import → extract → check → human review → confirm → operational record
```

**Automation proposes. A person confirms.** Nothing reaches your costs or reports until you say so.

This page is the complete guide: install it, try it with the included demo data, then use it day by day. No prior experience with servers is assumed — every command is meant to be copied exactly as written.

**Contents**

1. [See it before installing](#1-see-it-before-installing)
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

## 1. See it before installing

Open the [interactive product tour](https://student13thirteen.github.io/NFRP/). It runs entirely in the browser with invented data and takes about a minute.

The tour is a preview of the workflow, not the real application: it does not run OCR or a database. The real product needs the installation below.

---

## 2. Install it

### 2.1 What you need

- a Linux server, or any Linux computer you can leave running;
- at least 4 GB of RAM;
- an internet connection during installation;
- Docker Engine, Docker Compose v2 and Git.

You do **not** need Node.js, PostgreSQL or OCR tools on the machine. Docker brings them.

Check the three tools first:

```bash
docker --version
docker compose version
git --version
```

Each line must print a version number. If `docker` answers with a permission error, ask whoever administers the machine to add your user to the Docker group. Never fix it by loosening file permissions.

### 2.2 Download the project

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
```

Every command in this guide runs from that `NFRP` folder.

### 2.3 Run the guided installer

```bash
bash nfrp setup
```

The installer asks a short list of questions. If you are only trying the product, these answers are safe:

| Question | Safe first answer | Why |
|---|---|---|
| Company name | Press Enter | Uses the demo name; you can change it later from the app |
| Product name | Press Enter | Keeps `NFRP` in the sidebar |
| Interface subtitle | Press Enter | Optional line under the product name |
| Administrator email | An address you will remember | It becomes your login |
| Colors (four questions) | Press Enter each time | Accessible defaults; changeable later |
| Logo file | Press Enter | Skips the logo; you can upload one later |
| Access mode | `1` | Binds to this machine only: the safest start |
| Port | Press Enter | Uses `3000`; pick another number if it is taken |

The first build takes several minutes. Do not close the terminal.

What the installer does for you: it generates private secrets, builds the containers, creates the database, applies **every migration**, loads synthetic demo records, waits until the application answers as healthy, and finally prints the address, the administrator email and a generated password.

A successful run ends with `Setup complete` and three values:

```text
URL:      http://localhost:3000
Email:    you@example.com
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
| Customer | `Cliente Demo S.r.l.` |
| Supplier | `Officina Demo S.r.l.` |
| Category | `Lavaggio` |
| Document types | Insurance, roadworthiness test, tachograph and more |

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
| `Manutenzioni` | Maintenance, workshop invoices and delivery notes |
| `Magazzino` | Warehouse and parts |
| `Centro costi` | Cost center |
| `Autisti`, `Trattori`, `Semirimorchi` | Drivers, tractors, trailers |
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

### After the demo

Everything you created is invented and can be deleted from each page. If you prefer to start over completely, reinstall on an empty database — see [Server setup](docs/SETUP.md).

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
| Manage parts and stock | `Magazzino` | Load parts, mount them on a vehicle, and see the movement history |
| Plan and close trips | `Viaggi` | Two separate flows: fuel deliveries and container transports, each with its own data |
| Import container waybills | `Viaggi → Importa bolle container` | OCR proposes waybill, plate, customer, terminal and stops; the pending banner takes you to the review queue |
| See where the money goes | `Centro costi` | Trips, fuel, tolls, leasing, maintenance, documents and warehouse together, with filters and a PDF report |
| Keep registries in order | `Autisti`, `Trattori`, `Semirimorchi`, `Clienti` | People, vehicles and customers, with employment periods and dated driver-vehicle assignments |
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

**The port is already in use.** On a brand-new installation, run `bash nfrp setup` and choose another port, for example `3001`. On an existing installation, edit `APP_PORT` and `APP_PUBLIC_URL` in `.env`, then run `bash nfrp start` and `bash nfrp doctor`.

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

The application works fully without any of these. Enable one at a time, and only after `bash nfrp doctor` passes.

- **Nextcloud** — mirrors new or changed PDFs through WebDAV and moves them when their status changes;
- **Telegram** — sends scheduled expiry notifications;
- **Ollama** — powers the read-only `NFRP Bot` with a local model;
- **Cloudflare Tunnel** — publishes the application without opening router ports.

Variables, commands and safety notes: [Optional integrations](docs/INTEGRATIONS.md).

**Access modes**, chosen during setup: this server only (`127.0.0.1`), LAN or reverse proxy (`0.0.0.0`, protect the host with a firewall), or Cloudflare Tunnel. The PostgreSQL port is never published on the host. Details in [Server setup](docs/SETUP.md).

**Branding**: company name, product name, subtitle, logo and palette are configuration, not code. Change them during setup or later from `Impostazioni → Identità aziendale`. See [Branding](docs/BRANDING.md).

---

## 11. For developers

Node.js 20 or later.

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
| [Beginner guide](docs/BEGINNER_GUIDE.md) | You have never installed a server application |
| [Server setup](docs/SETUP.md) | Network, cookies, reverse proxy, upgrades |
| [Demo script](docs/DEMO.md) | You need to show the product to someone |
| [Optional integrations](docs/INTEGRATIONS.md) | Nextcloud, Telegram, Ollama, Cloudflare |
| [Company branding](docs/BRANDING.md) | Name, logo, palette |
| [Security model and limits](SECURITY.md) | Before real data |
| [Product origin](docs/PRODUCT_ORIGIN.md) and [platform vision](docs/ERP_PLATFORM_VISION.md) | Where the project comes from and where it is going |
| [Change history](docs/RELEASE_2026-08-19.md) | What changed in the latest synchronization, and what "parity with the operational edition" does and does not mean |

NFRP is an AI-assisted, operator-directed project built around real operational requirements. It does not claim that every line was written by hand, nor that one configuration fits every company without review.

Source code under the [MIT License](LICENSE). All included scenarios and data are synthetic.
