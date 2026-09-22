from __future__ import annotations

from pathlib import Path

from .base import VisionProvider, VisionResult


class MockVisionProvider:
    """M2 launch-minimum: vision is hardening-only. Mock is labeled and free."""

    name = "mock"

    def analyze_frame(self, frame_path: Path) -> VisionResult:
        _ = frame_path
        return VisionResult(
            labels=["public_space", "possible_surface_damage"],
            ocr_text=None,
            suggested_category="pothole",
            provider=self.name,
            model="mock-v0",
            is_mock=True,
            cost_cents=0,
        )


_: type[VisionProvider] = MockVisionProvider  # type: ignore[misc,assignment]
