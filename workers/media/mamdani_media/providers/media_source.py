from __future__ import annotations

from urllib.parse import urlparse

from .base import MediaSourceProvider


class AttributionOnlyMediaSource:
    """
    TikTok (etc.) link is attribution + dedup only.
    Never fetches or downloads remote media bytes.
    """

    name = "attribution_only"

    def describe(self, source_url: str | None) -> dict:
        if not source_url:
            return {"available": False, "reason": "no_source_url", "mock_label": "LOCAL DEV"}
        parsed = urlparse(source_url)
        host = (parsed.hostname or "").lower()
        if host in {"localhost", "127.0.0.1"} or host.endswith(".local"):
            return {
                "available": False,
                "reason": "blocked_host",
                "mock_label": "LOCAL DEV",
            }
        return {
            "available": True,
            "host": host,
            "scheme": parsed.scheme,
            "downloads_media": False,
            "mock_label": None,
        }


_: type[MediaSourceProvider] = AttributionOnlyMediaSource  # type: ignore[misc,assignment]
