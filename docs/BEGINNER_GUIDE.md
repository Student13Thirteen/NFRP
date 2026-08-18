# NFRP beginner guide

This guide assumes you have never installed a business application before. Follow the steps in order. Copy each command exactly and wait for it to finish before running the next one.

You do not need to install Node.js, PostgreSQL or OCR software on the server. Docker runs them for you.

## What you need

- a Linux server or Linux computer;
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

Each command must print a version. If `docker` reports a permission error, ask the server administrator to give your user access to Docker. Do not solve it by making application files public.

## Install NFRP

### Step 1: download the project

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
```

Your terminal is now inside the NFRP folder. Run every command in this guide from that folder.

### Step 2: start the guided installer

```bash
bash nfrp setup
```

The installer asks a few questions. If you are only testing NFRP, use these safe choices:

| Question | Safe first choice |
|---|---|
| Company name | Press Enter to use the demo name |
| Product name | Press Enter to use `NFRP` |
| Interface subtitle | Press Enter |
| Administrator email | Enter an email you will remember |
| Colors | Press Enter for every color |
| Logo path | Press Enter to skip it |
| Access mode | Enter `1` |
| HTTP port | Press Enter to use `3000` |

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
| `Autostrade` | Tolls |
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

Run `bash nfrp setup` only if this is a brand-new installation. Choose another port such as `3001` when asked.

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

Nextcloud, Telegram, Cloudflare Tunnel and the local assistant are not required for the first installation. First make sure `bash nfrp doctor` passes. Then enable one integration at a time by following [Optional integrations](INTEGRATIONS.md).

## Never publish these files

- `.env`;
- passwords, tokens or private URLs;
- production databases or backups;
- real PDFs and uploaded documents;
- `uploads`, logs or runtime folders;
- real employee names, plates, fiscal identifiers or company records.

The public NFRP repository contains synthetic examples only. Before using real data, read [SECURITY.md](../SECURITY.md).
