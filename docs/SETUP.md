# Server setup

## Prerequisites

- Linux server;
- Docker Engine;
- Docker Compose v2;
- at least 4 GB RAM for the base application;
- optional domain managed through Cloudflare for remote access.

## Guided path

```bash
git clone https://github.com/Student13Thirteen/nfrp.git
cd nfrp
bash nfrp setup
```

The script writes `.env` with mode `600`, generates database and session secrets, copies an optional logo into the ignored `branding/` directory with public-asset permissions, and starts only the profiles selected by the operator. The application waits for a real health response before reporting completion.

## Access modes

### Local server

The application binds to `127.0.0.1`. Use this for local testing or when another reverse proxy on the same host will provide access.

### LAN or external reverse proxy

The application binds to `0.0.0.0`. Protect the server with a firewall and expose only the intended application port or reverse proxy.

### Cloudflare Tunnel

Create a remotely managed tunnel and route its public hostname to:

```text
http://app:3000
```

Choose Cloudflare Tunnel during setup and paste the token. The token remains only in `.env`; it is never committed.

## Verification

```bash
bash nfrp status
bash nfrp doctor
bash nfrp demo
```

## Existing installation

Do not run a fresh setup over an existing production dataset without a backup. Preserve `.env`, Docker volumes and uploads, then test the upgrade on a copy.


## Session cookies

Cookie transport security is inferred from `APP_PUBLIC_URL`: HTTPS deployments use secure cookies, while local HTTP installations remain usable. `COOKIE_SECURE=true|false` is available only as an explicit reverse-proxy override.

## Clean-room test

The repository CI runs `bash scripts/ci_smoke.sh` on an empty runner. It builds the production image, starts PostgreSQL and the app, verifies migrations, synthetic seed data, initial branding and logo import, checks the anonymous auth boundary and performs a real administrator login.
