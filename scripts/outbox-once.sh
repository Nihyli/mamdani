#!/usr/bin/env bash
# Drain M3 outbox once (projection / share-card / purge). Local/dev cron entrypoint.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1090
  source .env
  set +a
fi
export ALLOW_DEV_AUTH="${ALLOW_DEV_AUTH:-true}"
API_URL="${PUBLIC_API_URL:-http://localhost:8787}"
curl -sS -X POST "${API_URL}/api/ops/outbox/run" -H "content-type: application/json"
echo
