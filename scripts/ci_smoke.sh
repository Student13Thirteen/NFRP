#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_LOGO="/tmp/nfrp-ci-source-logo.png"
DOWNLOADED_LOGO="/tmp/nfrp-ci-downloaded-logo.png"
cd "$ROOT_DIR"

cleanup() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ROOT_DIR/.env" "$ROOT_DIR"/.env.backup.*
  rm -f "$ROOT_DIR/branding/company-logo.png" "$SOURCE_LOGO" "$DOWNLOADED_LOGO" /tmp/nfrp-ci-env-executed
}

show_diagnostics() {
  printf '\n--- docker compose ps ---\n' >&2
  docker compose ps -a >&2 || true
  printf '\n--- PostgreSQL logs ---\n' >&2
  docker compose logs --no-color --tail=200 postgres >&2 || true
  printf '\n--- NFRP app logs ---\n' >&2
  docker compose logs --no-color --tail=300 app >&2 || true
}

read_env_value() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys
key = sys.argv[1]
for raw in Path('.env').read_text(encoding='utf-8').splitlines():
    if raw.startswith(key + '='):
        value = raw.split('=', 1)[1]
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        value = value.replace('\\"', '"').replace('\\$', '$').replace('\\\\', '\\')
        print(value)
        raise SystemExit(0)
raise SystemExit(f'Missing {key} in .env')
PY
}

trap cleanup EXIT
trap show_diagnostics ERR

cleanup

# Loading .env must never evaluate shell substitutions from operator-controlled text.
cat > .env <<'ENV'
APP_PUBLIC_URL="http://localhost/`touch /tmp/nfrp-ci-env-executed`"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="literal-$(touch /tmp/nfrp-ci-env-executed)"
ENV
bash nfrp credentials >/tmp/nfrp-ci-credentials.txt
[[ ! -e /tmp/nfrp-ci-env-executed ]]
rm -f .env /tmp/nfrp-ci-credentials.txt

# Valid one-pixel PNG. It exercises the exact setup-time logo copy/import path.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' \
  | base64 --decode > "$SOURCE_LOGO"

# Drive the real guided installer with synthetic answers.
printf '%s\n' \
  'Acme Demo Operations' \
  'FlowReady CI' \
  'Verified Operations Platform' \
  'admin@example.com' \
  '#2457d6' \
  '#183c9e' \
  '#152033' \
  '#17864b' \
  "$SOURCE_LOGO" \
  '1' \
  '18092' \
  | bash nfrp setup

[[ "$(stat -c '%a' .env)" == 600 ]]
[[ "$(stat -c '%a' branding)" == 755 ]]
[[ "$(stat -c '%a' branding/company-logo.png)" == 644 ]]

docker compose config --quiet

BASE_URL="$(read_env_value APP_PUBLIC_URL)"
ADMIN_EMAIL="$(read_env_value ADMIN_EMAIL)"
ADMIN_PASSWORD="$(read_env_value ADMIN_PASSWORD)"
POSTGRES_USER="$(read_env_value POSTGRES_USER)"
POSTGRES_DB="$(read_env_value POSTGRES_DB)"

curl -fsS "$BASE_URL/api/health" >/dev/null
LOGIN_HTML="$(curl -fsS "$BASE_URL/login")"
grep -Fq 'Acme Demo Operations' <<<"$LOGIN_HTML"
grep -Fq 'FlowReady CI' <<<"$LOGIN_HTML"

curl -fsS "$BASE_URL/api/branding/logo" -o "$DOWNLOADED_LOGO"
python3 - "$DOWNLOADED_LOGO" <<'PY'
from pathlib import Path
import sys
signature = Path(sys.argv[1]).read_bytes()[:8]
assert signature == b'\x89PNG\r\n\x1a\n', signature
PY

ADMIN_COUNT="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  'SELECT count(*) FROM "User" WHERE email = '\''admin@example.com'\'';')"
[[ "$ADMIN_COUNT" == 1 ]]

COMPANY_VALUE="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  'SELECT value FROM "AppSetting" WHERE key = '\''brand_company_name'\'';')"
[[ "$COMPANY_VALUE" == 'Acme Demo Operations' ]]

DEMO_TRACTORS="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  'SELECT count(*) FROM "Tractor";')"
(( DEMO_TRACTORS >= 1 ))

ANON_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/dashboard")"
[[ "$ANON_CODE" =~ ^(302|303|307|308)$ ]]

python3 scripts/smoke-login.py "$BASE_URL" "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

[[ -z "$(docker compose ps -q cloudflared)" ]]

trap - ERR
echo 'NFRP guided clean-room installation passed.'
