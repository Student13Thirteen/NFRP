#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
TEST_ROOT="$TEST_DIR/NFRP"
FAKE_BIN="$TEST_DIR/bin"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT" "$FAKE_BIN"
cp "$ROOT_DIR/nfrp" "$TEST_ROOT/nfrp"
chmod +x "$TEST_ROOT/nfrp"

cat > "$FAKE_BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail

case "${1:-} ${2:-} ${3:-} ${4:-}" in
  'compose version  '|'info   ')
    exit 0
    ;;
  'inspect --format '* )
    printf 'healthy\n'
    ;;
esac

if [[ "${1:-}" == 'compose' ]]; then
  case " ${*:2} " in
    *' ps -q app '*) printf 'fake-app-container\n' ;;
    *) exit 0 ;;
  esac
fi
DOCKER
chmod +x "$FAKE_BIN/docker"

PATH="$FAKE_BIN:$PATH" NFRP_QUICKSTART_PORT=18093 bash "$TEST_ROOT/nfrp" quickstart </dev/null >/dev/null

[[ -f "$TEST_ROOT/.env" ]]
[[ "$(stat -c '%a' "$TEST_ROOT/.env")" == '600' ]]
grep -Fq 'DEPLOYMENT_MODE="local"' "$TEST_ROOT/.env"
grep -Fq 'APP_BIND_ADDRESS="127.0.0.1"' "$TEST_ROOT/.env"
grep -Fq 'APP_PORT="18093"' "$TEST_ROOT/.env"
grep -Fq 'APP_PUBLIC_URL="http://localhost:18093"' "$TEST_ROOT/.env"
grep -Fq 'CLOUDFLARE_TOKEN=""' "$TEST_ROOT/.env"
if grep -Fq 'ADMIN_PASSWORD=""' "$TEST_ROOT/.env"; then
  printf 'quickstart did not generate an administrator password\n' >&2
  exit 1
fi

before="$(sha256sum "$TEST_ROOT/.env")"
if PATH="$FAKE_BIN:$PATH" bash "$TEST_ROOT/nfrp" quickstart </dev/null >/dev/null 2>&1; then
  printf 'quickstart unexpectedly replaced an existing installation\n' >&2
  exit 1
fi
after="$(sha256sum "$TEST_ROOT/.env")"
[[ "$before" == "$after" ]]

printf 'NFRP non-interactive local quickstart contract passed.\n'
