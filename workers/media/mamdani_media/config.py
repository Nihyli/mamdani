from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str
    upload_dir: Path
    worker_id: str
    lease_seconds: int
    concurrency: int
    once: bool
    poll_seconds: float
    ffmpeg_path: str | None
    transcription_provider: str
    openai_api_key: str | None
    geocoder_provider: str
    analysis_estimate_cents: int


def config_from_env(env: dict[str, str] | None = None) -> WorkerConfig:
    root = Path(__file__).resolve().parents[3]
    _load_dotenv(root / ".env")
    e = env if env is not None else os.environ
    upload = e.get("UPLOAD_DIR", ".uploads")
    upload_path = Path(upload)
    if not upload_path.is_absolute():
        upload_path = root / upload_path
    ffmpeg = e.get("FFMPEG_PATH") or _find_ffmpeg()
    return WorkerConfig(
        database_url=e.get(
            "DATABASE_URL",
            "postgres://postgres:postgres@localhost:5432/mamdani",
        ),
        upload_dir=upload_path,
        worker_id=e.get("WORKER_ID", "media-worker-1"),
        lease_seconds=int(e.get("WORKER_LEASE_SECONDS", "120")),
        concurrency=max(1, min(int(e.get("WORKER_CONCURRENCY", "2")), 4)),
        once=e.get("WORKER_ONCE", "").lower() in ("1", "true", "yes"),
        poll_seconds=float(e.get("WORKER_POLL_SECONDS", "2")),
        ffmpeg_path=ffmpeg,
        transcription_provider=e.get("TRANSCRIPTION_PROVIDER", "mock"),
        openai_api_key=e.get("OPENAI_API_KEY") or None,
        geocoder_provider=e.get("GEOCODER_PROVIDER", "nyc_geosearch"),
        analysis_estimate_cents=int(e.get("ANALYSIS_ESTIMATE_CENTS", "5")),
    )


def _find_ffmpeg() -> str | None:
    candidates = [
        "ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/opt/ffmpeg/bin/ffmpeg",
    ]
    for path in candidates:
        p = Path(path) if path.startswith("/") else None
        if p and p.is_file():
            return str(p)
        # bare name — defer to PATH at runtime
        if path == "ffmpeg":
            from shutil import which

            found = which("ffmpeg")
            if found:
                return found
    return None
