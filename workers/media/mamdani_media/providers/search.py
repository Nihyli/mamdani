from __future__ import annotations

from .base import SearchHit, SearchProvider


class MockSearchProvider:
    """Search is M2 hardening / M4 — mock only; never invents live results."""

    name = "mock"

    def search(self, query: str, *, limit: int = 3) -> list[SearchHit]:
        _ = query
        return [
            SearchHit(
                title="[MOCK] Search disabled until Milestone 4",
                url="https://example.invalid/mock-search",
                snippet="Mock SearchProvider — no live web fetch.",
                provider=self.name,
            )
        ][:limit]


_: type[SearchProvider] = MockSearchProvider  # type: ignore[misc,assignment]
