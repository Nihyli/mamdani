/**
 * Basemap style for MapLibre (SPEC §6 / §19 M1).
 *
 * Priority:
 * 1. VITE_MAP_STYLE_URL — production Protomaps style on R2/CDN
 * 2. Local NYC PMTiles at /basemap/nyc.pmtiles when the file exists
 *    (see apps/web/public/basemap/README.md)
 * 3. Explicit OpenFreeMap fallback only when the local archive is missing
 *    (local-dev stand-in — not production tile infrastructure)
 *
 * Do not point production traffic at the public OSM tile server.
 */

import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

const NYC_CENTER: [number, number] = [-73.97, 40.72];
const NYC_ZOOM = 11;

/** OpenFreeMap liberty — last-resort local-dev stand-in with glyphs/sprites. */
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Served from apps/web/public/basemap/nyc.pmtiles via Vite. */
export const LOCAL_NYC_PMTILES_PATH = "/basemap/nyc.pmtiles";

const PROTOMAPS_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export { NYC_CENTER, NYC_ZOOM };

let localPmtilesAvailable: boolean | null = null;
let localPmtilesProbe: Promise<boolean> | null = null;

/** HEAD/range check so we only build a PMTiles style when the archive is present. */
export async function probeLocalPmtiles(): Promise<boolean> {
  if (localPmtilesAvailable != null) return localPmtilesAvailable;
  if (!localPmtilesProbe) {
    localPmtilesProbe = (async () => {
      try {
        const res = await fetch(LOCAL_NYC_PMTILES_PATH, {
          method: "HEAD",
          cache: "no-store",
        });
        localPmtilesAvailable = res.ok;
      } catch {
        localPmtilesAvailable = false;
      }
      if (!localPmtilesAvailable) {
        console.warn(
          "[basemap] Local NYC PMTiles missing at",
          LOCAL_NYC_PMTILES_PATH,
          "— using OpenFreeMap stand-in. Run: bash apps/web/scripts/fetch-nyc-pmtiles.sh",
        );
      }
      return localPmtilesAvailable;
    })();
  }
  return localPmtilesProbe;
}

function localPmtilesStyle(): StyleSpecification {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const pmtilesUrl = `pmtiles://${origin}${LOCAL_NYC_PMTILES_PATH}`;
  return {
    version: 8,
    name: "protomaps-nyc-local",
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
      protomaps: {
        type: "vector",
        url: pmtilesUrl,
        attribution: PROTOMAPS_ATTRIBUTION,
      },
    },
    layers: layers("protomaps", namedFlavor("light"), { lang: "en" }),
  };
}

function rasterTileStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    name: "local-dev-osm-raster",
    sources: {
      "osm-raster": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · local-dev basemap stand-in',
      },
    },
    layers: [
      {
        id: "osm-raster",
        type: "raster",
        source: "osm-raster",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
}

/**
 * Synchronous style for MapLibre constructor.
 * Prefer resolveMapStyle() so local PMTiles is detected before map init.
 */
export function getMapStyle(): string | StyleSpecification {
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (styleUrl) return styleUrl;

  const tileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();
  if (tileUrl) return rasterTileStyle(tileUrl);

  if (localPmtilesAvailable === true) return localPmtilesStyle();
  return OPENFREEMAP_STYLE;
}

/** Async style resolution: local NYC PMTiles when present, else OpenFreeMap. */
export async function resolveMapStyle(): Promise<string | StyleSpecification> {
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (styleUrl) return styleUrl;

  const tileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();
  if (tileUrl) return rasterTileStyle(tileUrl);

  const hasLocal = await probeLocalPmtiles();
  if (hasLocal) return localPmtilesStyle();
  return OPENFREEMAP_STYLE;
}
