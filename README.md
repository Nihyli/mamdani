# MamdaniTicketer

Unofficial NYC community map (“Mamdani, Fix This”). Spec: `docs/SPEC.md`.

## Local run

```bash
cp .env.example .env
# set DATABASE_URL, ALLOW_DEV_AUTH=true, VITE_ALLOW_DEV_AUTH=true as needed
npm install
npm run db:local   # Postgres + PostGIS + migrations
npm run db:seed    # labeled [fixture] sample issues + local admin
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173
```

Dev admin id (seed): `00000000-0000-4000-8000-000000000001`.

## Milestone 2 media worker

```bash
# One-shot deps (once): python3 -m pip install --target workers/media/.deps -r workers/media/requirements.txt
npm run worker:media:once   # claim + process pending analysis jobs, then exit
npm run worker:media        # loop
```

Defaults to mock transcription + NYC GeoSearch (with labeled local stubs offline).
Set `TRANSCRIPTION_PROVIDER=openai` and `OPENAI_API_KEY` for Whisper. Optional
`FFMPEG_PATH` for real frame/audio extract; without FFmpeg the worker uses
labeled mock frames. Analysis pause / daily+monthly caps: admin UI or
`analysis_settings` / `GET|PATCH /api/admin/analysis`.

## Milestone 3 (launch-minimum)

```bash
npm run outbox:once          # drain projection / share-card / purge outbox
npm run export:encrypted     # needs EXPORT_ENCRYPTION_KEY (openssl rand -base64 32)
```

Public: `/api/public/manifest`, `/api/public/snapshots/{version}/{borough}.json`,
`/report-content`, `/copyright` (hidden until `COPYRIGHT_AGENT_*` is set),
`/metrics`, `/api/ops/readiness`. Terms/Privacy stay DRAFT; readiness fails until
operator/contact fields in `.env` are filled.

## Basemap (Protomaps PMTiles)

```bash
bash apps/web/scripts/fetch-nyc-pmtiles.sh
```

Writes `apps/web/public/basemap/nyc.pmtiles` (~28 MiB NYC extract, maxzoom 14).
Gitignored. Without it, the web app falls back to OpenFreeMap and warns in the
console. Production hosting on Cloudflare R2 needs credentials and
`VITE_MAP_STYLE_URL` — not invented here.

## Brand flip (G1)

Set `BRAND` / `VITE_BRAND` to `primary` or `fallback` (see `.env.example`).
