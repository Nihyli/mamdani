/**
 * NYC Planning Labs GeoSearch autocomplete adapter (docs/research/geocoder.md).
 * Persist only label + confirmed coordinates — never the raw GeoJSON response.
 */

export type GeocodeSuggestion = {
  label: string;
  longitude: number;
  latitude: number;
};

type PeliasFeature = {
  type: "Feature";
  geometry?: { type: string; coordinates?: number[] };
  properties?: {
    label?: string;
    name?: string;
    borough?: string;
  };
};

type PeliasResponse = {
  features?: PeliasFeature[];
};

const GEOSEARCH_URL =
  "https://geosearch.planninglabs.nyc/v2/autocomplete";

export async function autocompleteNyc(
  text: string,
  focus?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  const q = text.trim();
  if (q.length < 2) return [];

  const url = new URL(GEOSEARCH_URL);
  url.searchParams.set("text", q);
  if (focus) {
    url.searchParams.set("focus.point.lat", String(focus.latitude));
    url.searchParams.set("focus.point.lon", String(focus.longitude));
  }

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    throw new Error("Address lookup failed. Try again or drop a pin.");
  }
  const data = (await res.json()) as PeliasResponse;
  const features = data.features ?? [];

  // Map to our confirmed-pin shape only — discard raw provider payload.
  return features
    .map((feature): GeocodeSuggestion | null => {
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) return null;
      const longitude = coords[0];
      const latitude = coords[1];
      if (typeof longitude !== "number" || typeof latitude !== "number") {
        return null;
      }
      const label =
        feature.properties?.label ||
        feature.properties?.name ||
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      return { label, longitude, latitude };
    })
    .filter((item): item is GeocodeSuggestion => item != null)
    .slice(0, 8);
}

export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
