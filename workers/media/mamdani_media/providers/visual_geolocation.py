from __future__ import annotations

from pathlib import Path

from .base import VisualGeolocationCandidate, VisualGeolocationProvider


class MockVisualGeolocationProvider:
    """
    VisualGeolocationProvider slot (GeoSpy candidate) — Milestone 4 only.
    Interface exists; returns an empty labeled mock, never invents coordinates.
    """

    name = "mock"

    def locate(self, image_path: Path) -> list[VisualGeolocationCandidate]:
        _ = image_path
        # Empty on purpose: M4 acceptance required before any real provider.
        return []


_: type[VisualGeolocationProvider] = MockVisualGeolocationProvider  # type: ignore[misc,assignment]
