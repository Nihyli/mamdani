from __future__ import annotations

import hashlib
from pathlib import Path

from .base import TranscriptResult, TranscriptionProvider


FIXTURE_TRANSCRIPT = (
    "There's a huge pothole at Atlantic Avenue and Flatbush Avenue in Brooklyn. "
    "Someone should tag Mamdani so it gets fixed."
)


class MockTranscriptionProvider:
    """Local/dev transcription — visibly labeled; never fabricates paid success."""

    name = "mock"

    def transcribe(self, audio_path: Path, *, language: str | None = None) -> TranscriptResult:
        digest = ""
        if audio_path.is_file():
            digest = hashlib.sha256(audio_path.read_bytes()[:65536]).hexdigest()[:12]
        text = FIXTURE_TRANSCRIPT
        if digest:
            text = f"{FIXTURE_TRANSCRIPT} [audio:{digest}]"
        return TranscriptResult(
            text=text,
            provider=self.name,
            model="fixture-v1",
            language=language or "en",
            is_mock=True,
            cost_cents=0,
            units=0,
        )


class OpenAITranscriptionProvider:
    """Whisper transcription when OPENAI_API_KEY is set. Never called without a key."""

    name = "openai_whisper"

    def __init__(self, api_key: str, model: str = "whisper-1") -> None:
        if not api_key or api_key.startswith("your-"):
            raise ValueError("OPENAI_API_KEY is missing or placeholder")
        self.api_key = api_key
        self.model = model

    def transcribe(self, audio_path: Path, *, language: str | None = None) -> TranscriptResult:
        import httpx

        if not audio_path.is_file():
            raise FileNotFoundError(str(audio_path))
        with audio_path.open("rb") as fh:
            files = {"file": (audio_path.name, fh, "audio/mpeg")}
            data = {"model": self.model}
            if language:
                data["language"] = language
            headers = {"Authorization": f"Bearer {self.api_key}"}
            with httpx.Client(timeout=120.0) as client:
                res = client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers=headers,
                    data=data,
                    files=files,
                )
            res.raise_for_status()
            payload = res.json()
        text = str(payload.get("text") or "").strip()
        # Conservative estimate: ~$0.006/min → charge 1¢ minimum when audio exists
        cost = 1 if text else 0
        return TranscriptResult(
            text=text,
            provider=self.name,
            model=self.model,
            language=language,
            is_mock=False,
            cost_cents=cost,
            units=1.0,
        )


def build_transcription_provider(
    name: str,
    openai_api_key: str | None,
) -> TranscriptionProvider:
    if name == "openai" or name == "openai_whisper":
        if not openai_api_key or openai_api_key.startswith("your-"):
            return MockTranscriptionProvider()
        return OpenAITranscriptionProvider(openai_api_key)
    return MockTranscriptionProvider()
