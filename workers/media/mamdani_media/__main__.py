"""CLI entry: python -m mamdani_media [--once]."""

from __future__ import annotations

import argparse
import logging
import sys
import time
import traceback

from .config import config_from_env
from . import db as dbapi
from .pipeline import (
    AnalysisPaused,
    BudgetExhausted,
    process_job,
    release_to_manual_review,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mamdani media analysis worker (M2)")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Claim and process at most one batch, then exit",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Jobs to claim per loop (default: WORKER_CONCURRENCY)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log = logging.getLogger("mamdani.media")
    config = config_from_env()
    once = args.once or config.once
    limit = args.limit or config.concurrency

    log.info(
        "worker starting id=%s ffmpeg=%s transcription=%s geocoder=%s once=%s",
        config.worker_id,
        config.ffmpeg_path or "NONE (mock frames)",
        config.transcription_provider,
        config.geocoder_provider,
        once,
    )

    conn = dbapi.connect(config.database_url)
    try:
        dbapi.expire_stale_reservations(conn)
        while True:
            jobs = dbapi.claim_jobs(
                conn,
                limit=limit,
                lease_seconds=config.lease_seconds,
                worker_id=config.worker_id,
            )
            if not jobs:
                if once:
                    log.info("no jobs claimed; exiting")
                    return 0
                time.sleep(config.poll_seconds)
                continue

            for job in jobs:
                job_id = str(job["id"])
                token = str(job["lease_token"])
                log.info("claimed job=%s stage=%s attempt=%s", job_id, job["stage"], job["attempts"])
                try:
                    process_job(conn, job, config)
                    log.info("completed job=%s", job_id)
                except (BudgetExhausted, AnalysisPaused) as exc:
                    log.warning("analysis paused/budget for job=%s: %s", job_id, exc)
                    release_to_manual_review(conn, job, str(exc))
                    dbapi.complete_job(
                        conn, job_id, token, {"skipped": True, "reason": str(exc)}
                    )
                except Exception as exc:
                    log.error("job=%s failed: %s\n%s", job_id, exc, traceback.format_exc())
                    state = dbapi.fail_job(conn, job_id, token, str(exc), max_attempts=3)
                    if state == "dead":
                        release_to_manual_review(conn, job, f"dead: {exc}")
                        log.error("job=%s moved to dead; submission released to review", job_id)

            if once:
                return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
