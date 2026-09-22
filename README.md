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
