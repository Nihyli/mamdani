"""Unit tests for M2 proposal helpers (no live paid providers)."""

from __future__ import annotations

from mamdani_media.clues import extract_explicit_location_clues, suggest_title
from mamdani_media.pipeline import _stage_propose


def test_suggest_title_uses_category_and_location():
    title = suggest_title("pothole", "Atlantic and Flatbush", None)
    assert "pothole" in title.lower() or "Pothole" in title
    assert len(title) <= 200


def test_propose_schema_shape_matches_section_8():
    proposal = _stage_propose(
        submission={
            "category": "pothole",
            "title": None,
            "location_text": "at Atlantic Avenue and Flatbush Avenue",
        },
        transcript={
            "text": "There's a pothole at Atlantic Avenue and Flatbush Avenue.",
            "model": "mock-v0",
            "is_mock": True,
            "cost_cents": 0,
        },
        geocode={
            "candidates": [
                {
                    "latitude": 40.684,
                    "longitude": -73.977,
                    "precision": "intersection",
                    "clue": "Atlantic Avenue and Flatbush Avenue",
                    "label": "Atlantic Ave & Flatbush Ave",
                    "provider": "local_stub",
                }
            ]
        },
        duplicates={"suggested_duplicate_ids": []},
        vision_notes=[],
        extract_meta={"frame_count": 8, "mock_frames": True},
        transcription_provider="mock",
        geocoder_provider="local_stub",
    )
    assert proposal["schema_version"] == 1
    assert proposal["actionability"] in (
        "actionable",
        "uncertain",
        "non_actionable",
    )
    assert proposal["category"] == "pothole"
    assert proposal["needs_human_review"] is True
    assert isinstance(proposal["location_candidates"], list)
    assert proposal["location_candidates"][0]["latitude"] == 40.684
    assert "user_location" in {
        e["type"] for e in proposal["evidence_summaries"]
    }
    assert extract_explicit_location_clues(proposal["transcript_excerpt"] or "")
