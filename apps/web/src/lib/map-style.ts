/**
 * Basemap style for MapLibre.
 *
 * Production should set VITE_MAP_STYLE_URL to the Protomaps/PMTiles Worker style
 * (SPEC §6). When unset, we use a clearly labeled local-dev stand-in.
 *
 * LOCAL-DEV STAND-IN ONLY — not for production tile traffic.
 * Prefer OpenFreeMap (vector + glyphs) so clustering labels work; optional
 * VITE_MAP_TILE_URL forces a raster OSM-style fallback with attribution.
 */

import type { StyleSpecification } from "maplibre-gl";

const NYC_CENTER: [number, number] = [-73.97, 40.72];
const NYC_ZOOM = 11;

/** OpenFreeMap liberty style — local-dev stand-in with glyphs/sprites. */
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export { NYC_CENTER, NYC_ZOOM };

export function getMapStyle(): string | StyleSpecification {
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (styleUrl) return styleUrl;

  const tileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();
  if (tileUrl) {
    // Raster stand-in when explicitly configured (e.g. offline). Attribution required.
    const style: StyleSpecification = {
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
    return style;
  }

  // Default local-dev: OpenFreeMap (includes OSM attribution in the style).
  return OPENFREEMAP_STYLE;
}
