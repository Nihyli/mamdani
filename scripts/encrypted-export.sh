#!/usr/bin/env bash
# Encrypted scheduled DB export (SPEC §16 / M3).
# Local: writes an AES-256-CBC encrypted pg_dump under .exports/
# Production: set EXPORT_ENCRYPTION_KEY (32+ byte secret) and optionally EXPORT_DIR / cron.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1090
  source .env
  set +a
fi

DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/mamdani}"
EXPORT_DIR="${EXPORT_DIR:-${ROOT}/.exports}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PLAIN="${EXPORT_DIR}/mamdani-${STAMP}.sql"
ENC="${PLAIN}.enc"

mkdir -p "${EXPORT_DIR}"

PSQL_DUMP=""
if [[ -x /opt/homebrew/opt/postgresql@17/bin/pg_dump ]]; then
  PSQL_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"
elif command -v pg_dump >/dev/null 2>&1; then
  PSQL_DUMP="$(command -v pg_dump)"
elif [[ -x /opt/homebrew/opt/postgresql@16/bin/pg_dump ]]; then
  PSQL_DUMP="/opt/homebrew/opt/postgresql@16/bin/pg_dump"
fi

if [[ -z "${PSQL_DUMP}" ]]; then
  echo "error: pg_dump not found" >&2
  exit 1
fi

if [[ -z "${EXPORT_ENCRYPTION_KEY:-}" || "${EXPORT_ENCRYPTION_KEY}" == your-* ]]; then
  echo "error: set EXPORT_ENCRYPTION_KEY to a real secret before running encrypted export." >&2
  echo "hint: openssl rand -base64 32" >&2
  exit 1
fi

echo "Dumping database..."
"${PSQL_DUMP}" --no-owner --no-acl "${DATABASE_URL}" > "${PLAIN}"

echo "Encrypting..."
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${PLAIN}" \
  -out "${ENC}" \
  -pass "env:EXPORT_ENCRYPTION_KEY"

rm -f "${PLAIN}"
echo "Wrote ${ENC}"
echo "Restore (offline): openssl enc -d -aes-256-cbc -pbkdf2 -in ${ENC} -out restore.sql -pass env:EXPORT_ENCRYPTION_KEY"
