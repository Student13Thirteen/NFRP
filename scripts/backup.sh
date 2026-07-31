#!/bin/sh
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p /backups

DB_BACKUP="/backups/postgres-${STAMP}.sql"
UPLOADS_BACKUP="/backups/uploads-${STAMP}.tar.gz"

echo "Creating database backup: ${DB_BACKUP}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h postgres \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-privileges \
  > "${DB_BACKUP}"

echo "Creating uploads backup: ${UPLOADS_BACKUP}"
tar -czf "${UPLOADS_BACKUP}" -C /app/uploads .

echo "Backup completed:"
echo "${DB_BACKUP}"
echo "${UPLOADS_BACKUP}"
