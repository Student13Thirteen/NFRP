# NFRP beginner guide

This guide assumes you have never installed a business application before. It runs the real NFRP application locally; you do not need to rent or configure a server.

You do not need to install Node.js, PostgreSQL, OCR software, Cloudflare or a database. Docker runs the application components for you.

## What you need

- Windows 11 with Docker Desktop and WSL 2, macOS with Docker Desktop, or a Linux computer with Docker Engine;
- at least 4 GB of RAM;
- an internet connection during installation;
- Docker Engine;
- Docker Compose v2;
- Git.

Check the required tools:

```bash
docker --version
docker compose version
git --version
```

Each command must print a version. On Windows, use an Ubuntu/WSL 2 terminal and enable its integration in Docker Desktop. On Linux, if `docker` reports a permission error, follow Docker's documented non-root setup. Do not solve it by making application files public.

## Install NFRP

### Step 1: download the project

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
```

Your terminal is now inside the NFRP folder. Run every command in this guide from that folder.

### Step 2: start the local application

```bash
bash nfrp quickstart
```

There are no questions. `quickstart` chooses safe demo branding, generates credentials, binds the application only to this computer and never starts a tunnel. It also refuses to replace an installation that already has a `.env` file.

The first build can take several minutes. Do not close the terminal while it is working. A successful installation ends with `Setup complete` and prints three values:

- `URL` — the address to open;
- `Email` — the administrator login;
- `Password` — the generated initial password.

### Step 3: check the installation

```bash
bash nfrp doctor
```

The important lines should show `[ok]`. Then print the login details again:

```bash
bash nfrp credentials
```

Open the URL in a browser and sign in.

If you later want to choose the name, colors, logo, administrator email/password, port or an administrator-managed network mode during installation, use `bash nfrp setup` on a new empty checkout. The password input is hidden and accepts at least 12 characters; leave it empty to generate one. You can also change branding from the application after quickstart.

## Try the product with safe demo data

Run:

```bash
bash nfrp demo
```

Follow the numbered instructions printed in the terminal. When the application asks for a toll file, choose:

```text
examples/tolls/demo-tolls.csv
```

That file contains invented data. It demonstrates parsing, a review queue, duplicate protection, confirmation and cost-center results.

The real application menus are currently in Italian. The most useful labels are:

| Italian label in the app | Meaning |
|---|---|
| `Panoramica` | Dashboard / overview |
| `Acquisisci` | Import or upload |
| `Pedaggi` | Tolls |
| `Centro costi` | Cost center |
| `Impostazioni` | Settings |
| `Identità aziendale` | Company identity |

## Six commands to remember

```bash
bash nfrp start       # Start NFRP
bash nfrp stop        # Stop NFRP without deleting data
bash nfrp status      # Show what is running
bash nfrp doctor      # Check common problems
bash nfrp logs app    # Show app messages; press Ctrl+C to exit
bash nfrp backup      # Back up the database and uploaded files
```

`bash nfrp stop` is safe: it preserves the Docker volumes.

Do not run commands containing `down -v`, `volume rm`, `system prune --volumes` or `rm -rf` unless you understand exactly what they delete and already have a tested backup.

## Update NFRP safely

Run these commands from the NFRP folder:

```bash
git pull --ff-only
bash nfrp update
bash nfrp doctor
```

The update command creates a safety backup before rebuilding the application. Also copy important backups to another machine or storage service. A backup on the same server will not help if that server is lost.

Do not run `bash nfrp setup` again on an existing installation just to update it. Use `bash nfrp update`.

## If something goes wrong

### The page does not open

```bash
bash nfrp status
bash nfrp doctor
```

If the app is stopped, run:

```bash
bash nfrp start
```

### The app container is unhealthy

```bash
bash nfrp logs app
```

Read the last error. Press `Ctrl+C` to stop watching the log. Do not delete volumes as a troubleshooting shortcut.

### Port 3000 is already in use

For a brand-new quickstart, choose another local port without opening the guided installer:

```bash
NFRP_QUICKSTART_PORT=3001 bash nfrp quickstart
```

For an existing installation, edit `APP_PORT` and `APP_PUBLIC_URL` in `.env`, then run:

```bash
bash nfrp start
bash nfrp doctor
```

### You forgot the generated password

```bash
bash nfrp credentials
```

The `.env` file stores the initial credentials locally. Never send that file to another person and never commit it to GitHub.

### `git pull --ff-only` refuses to update

Stop and inspect your local changes:

```bash
git status
```

Do not discard changes you do not recognize. Ask someone to review them before updating.

## Optional features come later

Nextcloud, Telegram, Cloudflare Tunnel and the local assistant are not required for local use. Cloudflare is an administrator option for deliberately publishing a self-hosted instance, not an end-user setup step. First make sure `bash nfrp doctor` passes, then enable one integration at a time by following [Optional integrations](INTEGRATIONS.md).

## Never publish these files

- `.env`;
- passwords, tokens or private URLs;
- production databases or backups;
- real PDFs and uploaded documents;
- `uploads`, logs or runtime folders;
- real employee names, plates, fiscal identifiers or company records.

The public NFRP repository contains synthetic examples only. Before using real data, read [SECURITY.md](../SECURITY.md).
