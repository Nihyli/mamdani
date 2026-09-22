#!/usr/bin/env bash
# Fetch a NYC-bounded Protomaps basemap extract for local MapLibre (SPEC §19 M1).
# No Cloudflare R2 credentials required. Output ~28–40 MB at maxzoom 14.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT_DIR="${ROOT}/apps/web/public/basemap"
OUT="${OUT_DIR}/nyc.pmtiles"
TMP="${ROOT}/.tmp"
CLI="${TMP}/bin/pmtiles"
BBOX="-74.26,40.49,-73.70,40.92"
MAXZOOM="${MAXZOOM:-14}"

mkdir -p "${OUT_DIR}" "${TMP}/bin"

if [[ ! -x "${CLI}" ]]; then
  echo "Downloading pmtiles CLI…"
  curl -sSL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    -o "${TMP}/pmtiles-release.json"
  URL="$(python3 - <<PY
import json, platform
from pathlib import Path
d = json.loads(Path("${TMP}/pmtiles-release.json").read_text())
machine = platform.machine().lower()
want_arm = machine in ("arm64", "aarch64")
sysname = platform.system().lower()
url = None
for a in d.get("assets", []):
    name = a["name"].lower()
    is_darwin = "darwin" in name
    is_linux = "linux" in name
    is_arm = "arm64" in name or "aarch64" in name
    is_amd = "amd64" in name or "x86_64" in name
    if sysname == "darwin" and is_darwin and ((want_arm and is_arm) or (not want_arm and is_amd)):
        url = a["browser_download_url"]; break
    if sysname == "linux" and is_linux and ((want_arm and is_arm) or (not want_arm and is_amd)):
        url = a["browser_download_url"]; break
if not url:
    raise SystemExit("no matching pmtiles binary for this OS")
print(url)
PY
)"
  echo "Fetching ${URL}"
  curl -sSL "${URL}" -o "${TMP}/pmtiles-cli.bin"
  if file "${TMP}/pmtiles-cli.bin" | grep -qi zip; then
    unzip -o "${TMP}/pmtiles-cli.bin" -d "${TMP}/bin"
  else
    tar -xzf "${TMP}/pmtiles-cli.bin" -C "${TMP}/bin"
  fi
  chmod +x "${CLI}"
fi

BUILD=""
for d in 0 1 2 3 4 5 6 7; do
  if date -u -v-${d}d +%Y%m%d >/dev/null 2>&1; then
    CAND="$(date -u -v-${d}d +%Y%m%d)"
  else
    CAND="$(date -u -d "-${d} day" +%Y%m%d)"
  fi
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' -I "https://build.protomaps.com/${CAND}.pmtiles" || true)"
  echo "probe ${CAND} -> ${CODE}"
  if [[ "${CODE}" == "200" || "${CODE}" == "206" ]]; then
    BUILD="${CAND}"
    break
  fi
done

if [[ -z "${BUILD}" ]]; then
  echo "error: could not find a recent Protomaps daily build." >&2
  echo "OpenFreeMap remains the MapLibre fallback until ${OUT} exists." >&2
  exit 1
fi

echo "Extracting NYC bbox ${BBOX} maxzoom=${MAXZOOM} from build ${BUILD}…"
"${CLI}" extract \
  "https://build.protomaps.com/${BUILD}.pmtiles" \
  "${OUT}" \
  --bbox="${BBOX}" \
  --maxzoom="${MAXZOOM}"

BYTES="$(wc -c < "${OUT}" | tr -d ' ')"
echo "Wrote ${OUT} (${BYTES} bytes ≈ $(python3 -c "print(round(${BYTES}/1024/1024,1))") MiB)."
"${CLI}" show "${OUT}" | head -20
echo "Restart Vite if it was already running so /basemap/nyc.pmtiles is served."
