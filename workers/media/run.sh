#!/usr/bin/env bash
# Run the Milestone 2 media worker once or as a loop.
# Uses workers/media/.deps if present (pip install --target), else system PYTHONPATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MEDIA="$ROOT/workers/media"
export PYTHONPATH="${MEDIA}/.deps:${MEDIA}${PYTHONPATH:+:$PYTHONPATH}"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
cd "$MEDIA"
exec python3 -m mamdani_media "$@"
