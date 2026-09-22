"""Analysis pipeline stages (SPEC §8 launch-minimum for M2)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from . import PIPELINE_VERSION
from .clues import extract_explicit_location_clues, suggest_title
from .config import WorkerConfig
from . import db as dbapi
from . import ffmpeg_extract
from .providers import (
    AttributionOnlyMediaSource,
    LocalFilesystemObjectStore,
    MockSearchProvider,
    MockVisionProvider,
    MockVisualGeolocationProvider,
    build_geocoder,
    build_transcription_provider,
)

log = logging.getLogger("mamdani.media")

STAGES = (
    "validate",
    "extract",
    "transcribe",
    "geocode_clues",
    "find_duplicates",
    "propose",
)


class AnalysisPaused(Exception):
    pass


class BudgetExhausted(Exception):
    pass


def process_job(conn: psycopg.Connection, job: dict[str, Any], config: WorkerConfig) -> dict[str, Any]:
    job_id = str(job["id"])
    lease_token = str(job["lease_token"])
    submission_id = job.get("submission_id")
    if not submission_id:
        raise RuntimeError("job missing submission_id")

    store = LocalFilesystemObjectStore(config.upload_dir)
    transcription = build_transcription_provider(
        config.transcription_provider,
        config.openai_api_key,
    )
    geocoder = build_geocoder(config.geocoder_provider)
    vision = MockVisionProvider()
    search = MockSearchProvider()
    visual_geo = MockVisualGeolocationProvider()
    media_source = AttributionOnlyMediaSource()

    # Mark submission processing
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE public.submissions
            SET processing_state = 'processing', updated_at = now()
            WHERE id = %s::uuid
              AND processing_state IN ('queued', 'processing')
            """,
            (submission_id,),
        )
    conn.commit()

    dbapi.heartbeat(conn, job_id, lease_token, config.lease_seconds)

    submission = _load_submission(conn, str(submission_id))
    media_rows = _load_media(conn, str(submission_id))

    # --- validate ---
    validate_out = dbapi.get_stage_output(conn, job_id, "validate")
    if validate_out is None:
        validate_out = _stage_validate(media_rows, store, media_source, submission)
        dbapi.save_stage_output(conn, job_id, "validate", validate_out)

    # --- extract ---
    extract_out = dbapi.get_stage_output(conn, job_id, "extract")
    work = ffmpeg_extract.temporary_work_dir()
    try:
        work_path = Path(work.name)
        if extract_out is None:
            extract_out = _stage_extract(
                media_rows, store, config.ffmpeg_path, work_path
            )
            # Paths are ephemeral — store digests/timestamps only
            dbapi.save_stage_output(
                conn,
                job_id,
                "extract",
                {
                    "frame_count": extract_out["frame_count"],
                    "frame_timestamps_ms": extract_out["frame_timestamps_ms"],
                    "audio_extracted": extract_out["audio_extracted"],
                    "ffmpeg_used": extract_out["ffmpeg_used"],
                    "mock_frames": extract_out["mock_frames"],
                },
            )
        else:
            # Re-extract into this work dir for downstream stages
            extract_out = _stage_extract(
                media_rows, store, config.ffmpeg_path, work_path
            )

        dbapi.heartbeat(conn, job_id, lease_token, config.lease_seconds)

        # --- transcribe ---
        transcript_out = dbapi.get_stage_output(conn, job_id, "transcribe")
        if transcript_out is None:
            transcript_out = _stage_transcribe(
                conn,
                job_id,
                transcription,
                extract_out.get("audio_path"),
                estimate_cents=config.analysis_estimate_cents,
            )
            dbapi.save_stage_output(conn, job_id, "transcribe", transcript_out)

        # Optional mock vision pass (free) — does not call paid multimodal
        vision_notes: list[str] = []
        for frame_path in extract_out.get("frame_paths") or []:
            result = vision.analyze_frame(Path(frame_path))
            if result.suggested_category:
                vision_notes.append(result.suggested_category)
            # Explicitly leave VisualGeolocation / Search unused (M4)
            _ = visual_geo.locate(Path(frame_path))
            _ = search.search("nyc repair")

        dbapi.heartbeat(conn, job_id, lease_token, config.lease_seconds)

        # --- geocode explicit clues ---
        geocode_out = dbapi.get_stage_output(conn, job_id, "geocode_clues")
        if geocode_out is None:
            geocode_out = _stage_geocode(
                conn,
                str(submission_id),
                geocoder,
                submission.get("location_text"),
                transcript_out.get("text"),
            )
            dbapi.save_stage_output(conn, job_id, "geocode_clues", geocode_out)

        # --- duplicates within 50 m ---
        dup_out = dbapi.get_stage_output(conn, job_id, "find_duplicates")
        if dup_out is None:
            dup_out = _stage_duplicates(conn, submission)
            dbapi.save_stage_output(conn, job_id, "find_duplicates", dup_out)

        # --- proposal ---
        proposal_out = dbapi.get_stage_output(conn, job_id, "propose")
        if proposal_out is None:
            proposal_out = _stage_propose(
                submission=submission,
                transcript=transcript_out,
                geocode=geocode_out,
                duplicates=dup_out,
                vision_notes=vision_notes,
                extract_meta=extract_out,
                transcription_provider=transcription.name,
                geocoder_provider=geocoder.name,
            )
            dbapi.save_stage_output(conn, job_id, "propose", proposal_out)
            _persist_proposal(conn, str(submission_id), job_id, proposal_out)

        # Move to pending_review
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.submissions
                SET processing_state = 'pending_review', updated_at = now()
                WHERE id = %s::uuid
                  AND processing_state IN ('queued', 'processing')
                """,
                (submission_id,),
            )
            cur.execute(
                """
                INSERT INTO public.outbox (topic, payload)
                VALUES ('analysis.completed', %s::jsonb)
                """,
                (Jsonb({"submission_id": str(submission_id), "job_id": job_id}),),
            )
        conn.commit()

        ok = dbapi.complete_job(
            conn,
            job_id,
            lease_token,
            {"proposal_schema_version": 1, "pipeline_version": PIPELINE_VERSION},
        )
        if not ok:
            raise RuntimeError("complete_job rejected (stale lease token)")
        return proposal_out
    finally:
        work.cleanup()


def release_to_manual_review(
    conn: psycopg.Connection,
    job: dict[str, Any],
    reason: str,
) -> None:
    """On analysis pause/failure after max retries — keep M1 manual path."""
    submission_id = job.get("submission_id")
    if submission_id:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.submissions
                SET processing_state = 'pending_review', updated_at = now()
                WHERE id = %s::uuid
                  AND processing_state IN ('queued', 'processing')
                """,
                (submission_id,),
            )
            cur.execute(
                """
                INSERT INTO public.outbox (topic, payload)
                VALUES ('analysis.skipped', %s::jsonb)
                """,
                (
                    Jsonb(
                        {
                            "submission_id": str(submission_id),
                            "job_id": str(job["id"]),
                            "reason": reason,
                        }
                    ),
                ),
            )
        conn.commit()


def _load_submission(conn: psycopg.Connection, submission_id: str) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id, s.category::text, s.title, s.description, s.location_text,
              ST_X(s.location) AS longitude, ST_Y(s.location) AS latitude,
              s.location_precision::text, sp.canonical_url AS source_url
            FROM public.submissions s
            LEFT JOIN public.source_posts sp ON sp.id = s.source_post_id
            WHERE s.id = %s::uuid
            """,
            (submission_id,),
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError(f"submission not found: {submission_id}")
    return dict(row)


def _load_media(conn: psycopg.Connection, submission_id: str) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, private_object_key, mime_type, byte_size, content_digest,
                   upload_completed_at
            FROM public.media
            WHERE submission_id = %s::uuid
            ORDER BY created_at
            """,
            (submission_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def _stage_validate(
    media_rows: list[dict[str, Any]],
    store: LocalFilesystemObjectStore,
    media_source: AttributionOnlyMediaSource,
    submission: dict[str, Any],
) -> dict[str, Any]:
    checked: list[dict[str, Any]] = []
    for row in media_rows:
        key = row["private_object_key"]
        path = store.resolve_local_path(key)
        exists = path.is_file()
        size = path.stat().st_size if exists else 0
        mime = row["mime_type"]
        if mime.startswith("video/") and size > 50 * 1024 * 1024:
            raise RuntimeError("video exceeds 50 MB limit")
        if mime.startswith("image/") and size > 10 * 1024 * 1024:
            raise RuntimeError("image exceeds 10 MB limit")
        checked.append(
            {
                "media_id": str(row["id"]),
                "object_key": key,
                "exists": exists,
                "byte_size": size,
                "mime_type": mime,
            }
        )
    if media_rows and not any(c["exists"] for c in checked):
        raise RuntimeError("no readable media on disk")
    source_meta = media_source.describe(submission.get("source_url"))
    return {"media": checked, "source": source_meta}


def _stage_extract(
    media_rows: list[dict[str, Any]],
    store: LocalFilesystemObjectStore,
    ffmpeg: str | None,
    work_dir: Path,
) -> dict[str, Any]:
    frame_paths: list[str] = []
    timestamps: list[int] = []
    audio_path: str | None = None
    ffmpeg_used = False
    mock_frames = False

    primary = next(
        (m for m in media_rows if str(m["mime_type"]).startswith("video/")),
        media_rows[0] if media_rows else None,
    )
    if primary:
        path = store.resolve_local_path(primary["private_object_key"])
        frames = ffmpeg_extract.sample_frames(
            ffmpeg,
            path,
            work_dir / "frames",
            max_frames=8,
            mime_type=str(primary["mime_type"]),
        )
        ffmpeg_used = bool(ffmpeg) and not any(
            p.path.name.startswith("mock_frame_") for p in frames
        )
        mock_frames = any(p.path.name.startswith("mock_frame_") for p in frames)
        for frame in frames:
            frame_paths.append(str(frame.path))
            timestamps.append(frame.timestamp_ms)
        audio = ffmpeg_extract.extract_audio(
            ffmpeg,
            path,
            work_dir / "audio",
            mime_type=str(primary["mime_type"]),
        )
        if audio:
            audio_path = str(audio)

    return {
        "frame_paths": frame_paths,
        "frame_timestamps_ms": timestamps,
        "frame_count": len(frame_paths),
        "audio_path": audio_path,
        "audio_extracted": audio_path is not None,
        "ffmpeg_used": ffmpeg_used,
        "mock_frames": mock_frames,
    }


def _stage_transcribe(
    conn: psycopg.Connection,
    job_id: str,
    transcription: Any,
    audio_path: str | None,
    *,
    estimate_cents: int,
) -> dict[str, Any]:
    path = Path(audio_path) if audio_path else None
    if path is None:
        path = Path("/dev/null")

    usage_id: str | None = None
    try:
        # Reserve even for mock (0¢) so the ledger path is exercised; paid providers
        # reserve the configured estimate first.
        cost_estimate = max(estimate_cents, 0) if not getattr(
            transcription, "name", ""
        ) == "mock" else 0
        # Mock always 0; openai path reserves estimate
        if transcription.name != "mock":
            try:
                usage_id = dbapi.reserve_budget(
                    conn, job_id, transcription.name, max(estimate_cents, 1)
                )
            except Exception as exc:
                msg = str(exc)
                if "budget_exhausted" in msg or "analysis_paused" in msg:
                    raise BudgetExhausted(msg) from exc
                raise

        if path.is_file() or transcription.name == "mock":
            # For mock with missing audio, still return fixture text
            target = path if path.is_file() else Path(__file__)
            result = transcription.transcribe(target)
        else:
            result = transcription.transcribe(Path(__file__))

        if usage_id:
            dbapi.settle_usage(conn, usage_id, result.cost_cents, result.units)
        elif result.cost_cents == 0:
            # Record zero-cost mock usage for observability
            try:
                uid = dbapi.reserve_budget(conn, job_id, transcription.name, 0)
                dbapi.settle_usage(conn, uid, 0, 0)
            except Exception as exc:
                if "budget_exhausted" in str(exc) or "analysis_paused" in str(exc):
                    raise BudgetExhausted(str(exc)) from exc

        return {
            "text": result.text,
            "provider": result.provider,
            "model": result.model,
            "is_mock": result.is_mock,
            "cost_cents": result.cost_cents,
        }
    except Exception:
        if usage_id:
            dbapi.cancel_usage(conn, usage_id)
        raise


def _stage_geocode(
    conn: psycopg.Connection,
    submission_id: str,
    geocoder: Any,
    location_text: str | None,
    transcript: str | None,
) -> dict[str, Any]:
    clues = extract_explicit_location_clues(location_text, transcript)
    candidates: list[dict[str, Any]] = []
    seen_coords: set[tuple[float, float]] = set()
    for clue in clues:
        hits = geocoder.geocode_nyc(clue)
        for hit in hits[:2]:
            key = (round(hit.longitude, 5), round(hit.latitude, 5))
            if key in seen_coords:
                continue
            seen_coords.add(key)
            candidates.append(
                {
                    "clue": clue,
                    "label": hit.label,
                    "longitude": hit.longitude,
                    "latitude": hit.latitude,
                    "precision": hit.precision,
                    "provider": hit.provider,
                }
            )
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.location_candidates (
                      submission_id, geometry, precision, provider, verification
                    ) VALUES (
                      %s::uuid,
                      ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                      %s::public.location_precision,
                      %s,
                      'unverified'
                    )
                    """,
                    (
                        submission_id,
                        hit.longitude,
                        hit.latitude,
                        hit.precision
                        if hit.precision
                        in ("asset", "intersection", "block", "neighborhood", "user_supplied")
                        else "intersection",
                        hit.provider,
                    ),
                )
            conn.commit()
    return {"clues": clues, "candidates": candidates}


def _stage_duplicates(
    conn: psycopg.Connection,
    submission: dict[str, Any],
) -> dict[str, Any]:
    lng = submission.get("longitude")
    lat = submission.get("latitude")
    if lng is None or lat is None:
        return {"suggested_duplicate_ids": [], "candidates": []}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT issue_id, short_id, slug, title, category::text, status::text, distance_m
            FROM app.nearby_issue_candidates(
              %s::float8, %s::float8, 50::float8,
              %s::public.issue_category, 10
            )
            """,
            (float(lng), float(lat), submission.get("category")),
        )
        rows = [dict(r) for r in cur.fetchall()]
    return {
        "suggested_duplicate_ids": [str(r["issue_id"]) for r in rows],
        "candidates": [
            {
                "issue_id": str(r["issue_id"]),
                "short_id": r["short_id"],
                "slug": r["slug"],
                "title": r["title"],
                "category": r["category"],
                "status": r["status"],
                "distance_m": float(r["distance_m"]),
            }
            for r in rows
        ],
    }


def _stage_propose(
    *,
    submission: dict[str, Any],
    transcript: dict[str, Any],
    geocode: dict[str, Any],
    duplicates: dict[str, Any],
    vision_notes: list[str],
    extract_meta: dict[str, Any],
    transcription_provider: str,
    geocoder_provider: str,
) -> dict[str, Any]:
    category = submission.get("category") or (
        vision_notes[0] if vision_notes else "other"
    )
    # Ensure category is a known launch value
    allowed = {
        "pothole",
        "damaged_sidewalk",
        "broken_park_equipment",
        "broken_fountain",
        "overflowing_trash",
        "broken_streetlight",
        "other",
    }
    if category not in allowed:
        category = submission.get("category") or "other"

    title = submission.get("title") or suggest_title(
        category, submission.get("location_text"), transcript.get("text")
    )

    location_candidates = []
    for c in geocode.get("candidates") or []:
        location_candidates.append(
            {
                "latitude": c["latitude"],
                "longitude": c["longitude"],
                "precision": c["precision"]
                if c["precision"] in ("asset", "intersection", "block", "neighborhood")
                else "intersection",
                "evidence_ids": [f"clue:{c.get('clue', '')}"],
                "contradiction_ids": [],
                "verification": "unverified",
                "label": c.get("label"),
                "provider": c.get("provider"),
            }
        )

    # Cross-check note: user pin is primary; clues are candidates only
    evidence_summaries = [
        {
            "type": "user_location",
            "summary": f"User-supplied pin / text: {submission.get('location_text') or 'n/a'}",
        }
    ]
    if transcript.get("text"):
        evidence_summaries.append(
            {
                "type": "transcript",
                "summary": (transcript["text"][:500])
                + ("…" if len(transcript["text"]) > 500 else ""),
            }
        )
    if extract_meta.get("mock_frames"):
        evidence_summaries.append(
            {
                "type": "frame",
                "summary": "Frames produced by LOCAL MOCK extractor (FFmpeg unavailable).",
            }
        )
    elif extract_meta.get("frame_count"):
        evidence_summaries.append(
            {
                "type": "frame",
                "summary": f"Sampled {extract_meta['frame_count']} frames via FFmpeg.",
            }
        )
    for c in geocode.get("candidates") or []:
        evidence_summaries.append(
            {
                "type": "geocode",
                "summary": f"Explicit clue “{c.get('clue')}” → {c.get('label')} ({c.get('provider')})",
            }
        )

    missing: list[str] = []
    if not location_candidates:
        missing.append("No explicit address/intersection clue could be geocoded.")
    if transcript.get("is_mock"):
        missing.append("Transcript is from mock provider — verify against media.")

    proposal = {
        "schema_version": 1,
        "actionability": "actionable" if category != "other" else "uncertain",
        "category": category,
        "title": title[:200],
        "observed_at": None,
        "location_candidates": location_candidates,
        "missing_information": missing,
        "suggested_duplicate_ids": duplicates.get("suggested_duplicate_ids") or [],
        "needs_human_review": True,
        "evidence_summaries": evidence_summaries,
        "transcript_excerpt": (transcript.get("text") or "")[:4000] or None,
        "provider_versions": {
            "pipeline": PIPELINE_VERSION,
            "transcription": f"{transcription_provider}:{transcript.get('model')}",
            "geocoder": geocoder_provider,
            "vision": "mock-v0",
            "search": "mock",
            "visual_geolocation": "mock",
        },
        "estimated_cost_cents": int(transcript.get("cost_cents") or 0),
    }
    return proposal


def _persist_proposal(
    conn: psycopg.Connection,
    submission_id: str,
    job_id: str,
    proposal: dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.analysis_proposals (
              submission_id, job_id, schema_version, proposal, pipeline_version,
              estimated_cost_cents
            ) VALUES (
              %s::uuid, %s::uuid, 1, %s::jsonb, %s, %s
            )
            ON CONFLICT (submission_id) DO UPDATE SET
              job_id = EXCLUDED.job_id,
              proposal = EXCLUDED.proposal,
              pipeline_version = EXCLUDED.pipeline_version,
              estimated_cost_cents = EXCLUDED.estimated_cost_cents,
              created_at = now()
            """,
            (
                submission_id,
                job_id,
                Jsonb(proposal),
                PIPELINE_VERSION,
                proposal.get("estimated_cost_cents"),
            ),
        )
    conn.commit()
