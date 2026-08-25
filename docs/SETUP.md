# Deployment and network setup

## Recommended local path

To evaluate the real application, you do not need a server, domain, public IP or tunnel. Install Docker Desktop on Windows/macOS or Docker Engine on Linux, then run:

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
bash nfrp quickstart
```

On Windows, use an Ubuntu/WSL 2 terminal with Docker Desktop integration enabled. The command creates an isolated PostgreSQL database, generates credentials, builds the application and exposes it only at `http://localhost:3000`. It refuses to overwrite an existing `.env`.

This is the supported portfolio/demo path and the path exercised by the same installer code used in clean-room CI. Docker must remain running while NFRP is in use.

## Prerequisites

- Windows 11 + Docker Desktop + WSL 2, macOS + Docker Desktop, or Linux + Docker Engine;
- Docker Compose v2;
- at least 4 GB RAM for the base application;
- Git and Bash;
- an optional domain only when an administrator deliberately enables remote access.

## Customized path

```bash
git clone https://github.com/Student13Thirteen/NFRP.git
cd NFRP
bash nfrp setup
```

The guided script lets the operator choose the initial administrator email and password; an empty password generates a strong one automatically. It writes `.env` with mode `600`, generates database and session secrets, copies an optional logo into the ignored `branding/` directory with public-asset permissions, and starts only the profiles selected by the operator. The application waits for a real health response before reporting completion.

Choose local access unless you already understand and control the target network. NFRP does not require Cloudflare to work.

## Access modes

### Local computer — recommended

The application binds to `127.0.0.1`. Only this computer can reach it. `bash nfrp quickstart` always selects this mode.

### LAN or external reverse proxy

The application binds to `0.0.0.0`. This is an administrator deployment: protect the host with a firewall, TLS and an access policy, and expose only the intended application port or reverse proxy.

### Cloudflare Tunnel

This is optional and is not part of the local quickstart. Use it only when an administrator intentionally publishes a self-hosted instance.

Create a remotely managed tunnel and route its public hostname to:

```text
http://app:3000
```

Choose Cloudflare Tunnel during the guided setup and paste the token. The token remains only in `.env`; it is never committed. A normal evaluator never needs to perform this step.

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

The repository CI runs `bash scripts/ci_smoke.sh` on an empty runner. It builds the production image with Node 20, starts PostgreSQL and the app, verifies every migration, synthetic seed data, initial branding and logo import, checks the anonymous auth boundary and performs a real administrator login. GitHub Pages is deliberately not used: the public demonstration is the actual database-backed product.
