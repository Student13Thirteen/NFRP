#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md', 'LICENSE', 'SECURITY.md', '.env.example', 'docker-compose.yml',
    'nfrp', 'examples/tolls/demo-tolls.csv', 'docs/SETUP.md', 'docs/DEMO.md',
    'docs/BRANDING.md', 'src/app/api/health/route.ts', 'scripts/ci_smoke.sh',
    'scripts/smoke-login.py'
]
IGNORED_PATH_PARTS = {'.git'}
FORBIDDEN_PATH_PARTS = {'.env', 'node_modules', '.next', 'uploads', 'backups', 'pb_data', '__pycache__'}
FORBIDDEN_SUFFIXES = {'.db', '.sqlite', '.dump', '.bak', '.p12', '.pfx', '.key', '.pem', '.pyc'}
SUSPICIOUS = {
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'cloudflare token': re.compile(r'(?i)eyJhIjoi[\w-]{20,}'),
    'telegram token': re.compile(r'\b\d{6,12}:[A-Za-z0-9_-]{30,}\b'),
    'absolute home path': re.compile(r'/(?:home|Users)/[A-Za-z0-9._-]+/'),
    'invented NFRP expansion': re.compile(r'(?i)new\s*flow\s*ready\s*program'),
    'legacy application name': re.compile(r'(?i)' + 'net' + 'fleet'),
}
TEXT_SUFFIXES = {
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml',
    '.css', '.html', '.sql', '.csv', '.sh', '.py', '.example', ''
}

def fail(message: str) -> None:
    print(f'[fail] {message}')
    errors.append(message)

errors: list[str] = []

for item in REQUIRED:
    if not (ROOT / item).exists():
        fail(f'missing required path: {item}')

for path in ROOT.rglob('*'):
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT)
    if any(part in IGNORED_PATH_PARTS for part in rel.parts):
        continue
    if any(part in FORBIDDEN_PATH_PARTS for part in rel.parts):
        fail(f'forbidden runtime path tracked: {rel}')
    if path.suffix.lower() in FORBIDDEN_SUFFIXES:
        fail(f'forbidden sensitive file type: {rel}')
    if path.stat().st_size > 20 * 1024 * 1024:
        fail(f'file exceeds public repository limit: {rel}')
    if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in {'Dockerfile', 'LICENSE', 'nfrp'}:
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        fail(f'non-text file needs manual review: {rel}')
        continue
    for label, pattern in SUSPICIOUS.items():
        if pattern.search(text):
            fail(f'{label} detected in {rel}')

compose = (ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
if re.search(r'^\s+ports:\s*\n\s+-\s+["\']?[^$\n]*:5432', compose, re.M):
    fail('PostgreSQL host port must not be published')
if 'cloudflared:' not in compose or 'profiles:' not in compose:
    fail('remote access must remain an optional Compose profile')

cli = ROOT / 'nfrp'
if cli.exists() and not cli.stat().st_mode & 0o111:
    fail('nfrp CLI is not executable')
if cli.exists() and re.search(r'\bsource\s+["\']?\$ENV_FILE', cli.read_text(encoding='utf-8')):
    fail('nfrp CLI must parse .env without shell evaluation')

if errors:
    print(f'Public repository validation failed with {len(errors)} problem(s).')
    sys.exit(1)

print('Public repository validation passed.')
