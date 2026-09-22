"""Provider adapter interfaces (SPEC §20). Production providers are env-gated."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class MediaRef:
    media_id: str
    object_key: str
    mime_type: str
    local_path: Path | None = None


@dataclass(frozen=True)
class FrameSample:
    path: Path
    timestamp_ms: int
    content_digest: str | None = None


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    provider: str
    model: str
    language: str | None = None
    is_mock: bool = False
    cost_cents: int = 0
    units: float = 0.0


@dataclass(frozen=True)
class VisionResult:
    labels: list[str] = field(default_factory=list)
    ocr_text: str | None = None
    suggested_category: str | None = None
    provider: str = "mock"
    model: str = "mock-v0"
    is_mock: bool = True
    cost_cents: int = 0


@dataclass(frozen=True)
class GeocodeHit:
    label: str
    longitude: float
    latitude: float
    precision: str  # intersection | block | neighborhood | asset
    provider: str


@dataclass(frozen=True)
class SearchHit:
    title: str
    url: str
    snippet: str
    provider: str


@dataclass(frozen=True)
class VisualGeolocationCandidate:
    longitude: float
    latitude: float
    label: str
    provider: str
    score: float | None = None


@runtime_checkable
class ObjectStore(Protocol):
    def resolve_local_path(self, object_key: str) -> Path: ...

    def exists(self, object_key: str) -> bool: ...


@runtime_checkable
class MediaSourceProvider(Protocol):
    """Attribution / metadata only — never downloads TikTok media (SPEC §4B)."""

    name: str

    def describe(self, source_url: str | None) -> dict: ...


@runtime_checkable
class TranscriptionProvider(Protocol):
    name: str

    def transcribe(self, audio_path: Path, *, language: str | None = None) -> TranscriptResult: ...


@runtime_checkable
class VisionProvider(Protocol):
    """Multimodal frame analysis — M2 hardening; mock at launch-minimum."""

    name: str

    def analyze_frame(self, frame_path: Path) -> VisionResult: ...


@runtime_checkable
class Geocoder(Protocol):
    name: str

    def geocode_nyc(self, query: str) -> list[GeocodeHit]: ...


@runtime_checkable
class SearchProvider(Protocol):
    """Bounded web search — M4/hardening; mock only in M2."""

    name: str

    def search(self, query: str, *, limit: int = 3) -> list[SearchHit]: ...


@runtime_checkable
class VisualGeolocationProvider(Protocol):
    """GeoSpy-class visual geolocation — Milestone 4 only; mock interface."""

    name: str

    def locate(self, image_path: Path) -> list[VisualGeolocationCandidate]: ...
