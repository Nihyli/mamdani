from __future__ import annotations

import re
from urllib.parse import urlencode

import httpx

from .base import GeocodeHit, Geocoder

# Deterministic local stubs used when GeoSearch is unreachable (labeled).
LOCAL_STUBS: dict[str, GeocodeHit] = {
    "atlantic avenue and flatbush avenue": GeocodeHit(
        label="Atlantic Avenue & Flatbush Avenue, Brooklyn, NY (LOCAL STUB)",
        longitude=-73.9804,
        latitude=40.6841,
        precision="intersection",
        provider="local_stub",
    ),
    "broadway and canal street": GeocodeHit(
        label="Broadway & Canal Street, Manhattan, NY (LOCAL STUB)",
        longitude=-74.0010,
        latitude=40.7181,
        precision="intersection",
        provider="local_stub",
    ),
}


def _norm(query: str) -> str:
    return re.sub(r"\s+", " ", query.strip().lower().replace("&", "and"))


class NycGeoSearchGeocoder:
    """NYC Planning Labs GeoSearch — explicit-clue geocoding within NYC."""

    name = "nyc_geosearch"
    BASE = "https://geosearch.planninglabs.nyc/v2/search"

    def __init__(self, *, allow_stub_fallback: bool = True) -> None:
        self.allow_stub_fallback = allow_stub_fallback

    def geocode_nyc(self, query: str) -> list[GeocodeHit]:
        q = query.strip()
        if len(q) < 3:
            return []
        try:
            params = urlencode({"text": q, "size": 5})
            with httpx.Client(timeout=8.0) as client:
                res = client.get(f"{self.BASE}?{params}")
                res.raise_for_status()
                data = res.json()
        except Exception:
            return self._stub(q)

        hits: list[GeocodeHit] = []
        for feature in data.get("features") or []:
            coords = (feature.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lng, lat = float(coords[0]), float(coords[1])
            # Soft NYC bbox gate (same envelope as API)
            if not (-74.3 <= lng <= -73.7 and 40.4 <= lat <= 40.95):
                continue
            props = feature.get("properties") or {}
            label = props.get("label") or props.get("name") or q
            layer = str(props.get("layer") or "")
            precision = "intersection" if "intersection" in layer else "block"
            if layer in {"neighbourhood", "neighborhood", "locality"}:
                precision = "neighborhood"
            hits.append(
                GeocodeHit(
                    label=str(label),
                    longitude=lng,
                    latitude=lat,
                    precision=precision,
                    provider=self.name,
                )
            )
        if hits:
            return hits[:5]
        return self._stub(q)

    def _stub(self, query: str) -> list[GeocodeHit]:
        if not self.allow_stub_fallback:
            return []
        key = _norm(query)
        for stub_key, hit in LOCAL_STUBS.items():
            if stub_key in key or key in stub_key:
                return [hit]
        return []


class LocalStubGeocoder:
    """Clearly labeled deterministic geocoder for offline tests."""

    name = "local_stub"

    def geocode_nyc(self, query: str) -> list[GeocodeHit]:
        key = _norm(query)
        for stub_key, hit in LOCAL_STUBS.items():
            if stub_key in key or key in stub_key:
                return [hit]
        return []


def build_geocoder(name: str) -> Geocoder:
    if name == "local_stub":
        return LocalStubGeocoder()
    return NycGeoSearchGeocoder(allow_stub_fallback=True)
