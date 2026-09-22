# Local NYC Protomaps basemap

`nyc.pmtiles` is a **local-dev / pre-R2** extract of the Protomaps OSM basemap
for the NYC metro bbox (`-74.26,40.49,-73.70,40.92`), max zoom 14.

| Property | Value |
|---|---|
| Typical size | ~28–40 MiB (this checkout: ~28 MiB from build `20260921`) |
| Format | PMTiles v3 / MVT |
| Attribution | Protomaps + © OpenStreetMap (required; MapLibre attribution control stays on) |

## Fetch / refresh

```bash
bash apps/web/scripts/fetch-nyc-pmtiles.sh
```

The archive is gitignored (large binary). Without it, MapLibre falls back to
**OpenFreeMap** and logs a console warning — that stand-in is not production
tile infrastructure.

## Production (blocked without credentials)

Upload the same (or a fresher) extract to Cloudflare R2, serve range requests,
and set `VITE_MAP_STYLE_URL` to the hosted MapLibre style. Do not hotlink the
public OSM tile server.
