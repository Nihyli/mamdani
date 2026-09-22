"""FFmpeg frame sampling + audio extract with graceful mock fallback."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from .providers.base import FrameSample


def probe_duration_ms(ffmpeg: str | None, media_path: Path) -> int | None:
    ffprobe = _ffprobe_for(ffmpeg)
    if not ffprobe or not media_path.is_file():
        return None
    try:
        out = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(media_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        data = json.loads(out.stdout or "{}")
        duration = float((data.get("format") or {}).get("duration") or 0)
        if duration <= 0:
            return None
        return int(duration * 1000)
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        return None


def sample_frames(
    ffmpeg: str | None,
    media_path: Path,
    work_dir: Path,
    *,
    max_frames: int = 8,
    mime_type: str = "",
) -> list[FrameSample]:
    work_dir.mkdir(parents=True, exist_ok=True)
    if mime_type.startswith("image/") or _is_image(media_path):
        dest = work_dir / "frame_000.jpg"
        shutil.copyfile(media_path, dest)
        return [
            FrameSample(
                path=dest,
                timestamp_ms=0,
                content_digest=_digest(dest),
            )
        ]

    if not ffmpeg or not Path(ffmpeg).exists() and shutil.which(ffmpeg or "") is None:
        return _mock_frames(media_path, work_dir, max_frames=min(max_frames, 3))

    duration_ms = probe_duration_ms(ffmpeg, media_path) or 10_000
    # Cap at 60s product limit
    duration_ms = min(duration_ms, 60_000)
    count = max(1, min(max_frames, 10))
    frames: list[FrameSample] = []
    for i in range(count):
        # Spread samples across the clip, skip exact start/end edges slightly
        t_ms = int((i + 0.5) * duration_ms / count)
        out = work_dir / f"frame_{i:03d}.jpg"
        try:
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-ss",
                    f"{t_ms / 1000:.3f}",
                    "-i",
                    str(media_path),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    str(out),
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if out.is_file() and out.stat().st_size > 0:
            frames.append(
                FrameSample(path=out, timestamp_ms=t_ms, content_digest=_digest(out))
            )
    if not frames:
        return _mock_frames(media_path, work_dir, max_frames=min(max_frames, 3))
    return _dedupe_near_identical(frames)


def extract_audio(
    ffmpeg: str | None,
    media_path: Path,
    work_dir: Path,
    *,
    mime_type: str = "",
) -> Path | None:
    work_dir.mkdir(parents=True, exist_ok=True)
    if mime_type.startswith("image/") or _is_image(media_path):
        return None
    out = work_dir / "audio.mp3"
    if not ffmpeg:
        # Touch an empty placeholder so mock transcription still has a path
        out.write_bytes(b"")
        return out
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(media_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "64k",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError):
        out.write_bytes(b"")
        return out
    return out if out.is_file() else None


def temporary_work_dir(prefix: str = "mamdani-media-") -> tempfile.TemporaryDirectory[str]:
    return tempfile.TemporaryDirectory(prefix=prefix)


def _mock_frames(media_path: Path, work_dir: Path, *, max_frames: int) -> list[FrameSample]:
    """Labeled local fallback when FFmpeg is unavailable."""
    frames: list[FrameSample] = []
    for i in range(max_frames):
        dest = work_dir / f"mock_frame_{i:03d}.bin"
        payload = f"MOCK_FRAME:{media_path.name}:{i}".encode()
        if media_path.is_file():
            payload += media_path.read_bytes()[:2048]
        dest.write_bytes(payload)
        frames.append(
            FrameSample(
                path=dest,
                timestamp_ms=i * 1000,
                content_digest=_digest(dest),
            )
        )
    return frames


def _dedupe_near_identical(frames: list[FrameSample]) -> list[FrameSample]:
    seen: set[str] = set()
    out: list[FrameSample] = []
    for frame in frames:
        key = frame.content_digest or str(frame.path)
        if key in seen:
            continue
        seen.add(key)
        out.append(frame)
    return out


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _is_image(path: Path) -> bool:
    return path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _ffprobe_for(ffmpeg: str | None) -> str | None:
    if not ffmpeg:
        return None
    p = Path(ffmpeg)
    candidate = p.with_name("ffprobe")
    if candidate.is_file():
        return str(candidate)
    return shutil.which("ffprobe")
