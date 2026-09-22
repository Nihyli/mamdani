"""Explicit location clue extraction from transcript / location text."""

from __future__ import annotations

import re


def extract_explicit_location_clues(*texts: str | None) -> list[str]:
    clues: list[str] = []
    for text in texts:
        if not text:
            continue
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            continue

        and_pattern = re.compile(
            r"\b(?:at|near|on)\s+"
            r"([A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.']*){0,4})\s+"
            r"(?:and|&)\s+"
            r"([A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.']*){0,4})\b",
            re.I,
        )
        for match in and_pattern.finditer(normalized):
            clues.append(f"{match.group(1).strip()} and {match.group(2).strip()}")

        # Also catch "X and Y" without preposition when both look like streets
        bare = re.compile(
            r"\b([A-Z][\w.'-]*(?:\s+[A-Z][\w.']*){0,3}\s+(?:Ave|Avenue|St|Street|Blvd|Rd|Road))\s+"
            r"(?:and|&)\s+"
            r"([A-Z][\w.'-]*(?:\s+[A-Z][\w.']*){0,3}\s+(?:Ave|Avenue|St|Street|Blvd|Rd|Road))\b",
            re.I,
        )
        for match in bare.finditer(normalized):
            clues.append(f"{match.group(1).strip()} and {match.group(2).strip()}")

        street = re.compile(
            r"\b(\d{1,5}\s+(?:[NEWS]\.?\s+)?[A-Z][\w.'-]*(?:\s+[A-Z][\w.']*){0,3}\s+"
            r"(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Pl|Place|Ln|Lane|Way|Dr|Drive)\.?)\b",
            re.I,
        )
        for match in street.finditer(normalized):
            clues.append(match.group(1).strip())

    # Preserve order, unique
    seen: set[str] = set()
    out: list[str] = []
    for clue in clues:
        key = clue.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(clue)
    return out[:5]


def suggest_title(category: str | None, location_text: str | None, transcript: str | None) -> str:
    cat = (category or "other").replace("_", " ")
    if location_text:
        return f"{cat.capitalize()} near {location_text}"[:160]
    if transcript:
        first = transcript.split(".")[0].strip()
        if first:
            return first[:160]
    return f"{cat.capitalize()} report"
