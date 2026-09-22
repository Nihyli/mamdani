"""Unit tests for explicit-clue extraction (no database)."""

from mamdani_media.clues import extract_explicit_location_clues, suggest_title


def test_extracts_intersection():
    clues = extract_explicit_location_clues(
        "Huge hole at Atlantic Avenue and Flatbush Avenue today."
    )
    assert any("Atlantic" in c and "Flatbush" in c for c in clues)


def test_suggest_title_uses_location():
    title = suggest_title("pothole", "Atlantic & Flatbush", None)
    assert "Atlantic" in title
