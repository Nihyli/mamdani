"""Postgres job claim / complete helpers using app.* SQL functions."""

from __future__ import annotations

import json
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url, row_factory=dict_row)


def claim_jobs(
    conn: psycopg.Connection,
    *,
    limit: int,
    lease_seconds: int,
    worker_id: str,
) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM app.claim_jobs(%s, %s, %s)",
            (limit, lease_seconds, worker_id),
        )
        rows = list(cur.fetchall())
    conn.commit()
    return rows


def heartbeat(
    conn: psycopg.Connection,
    job_id: str,
    lease_token: str,
    lease_seconds: int,
) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT app.heartbeat_job(%s::uuid, %s::uuid, %s)",
            (job_id, lease_token, lease_seconds),
        )
        ok = bool(cur.fetchone()["heartbeat_job"])
    conn.commit()
    return ok


def complete_job(
    conn: psycopg.Connection,
    job_id: str,
    lease_token: str,
    result: dict[str, Any] | None = None,
) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT app.complete_job(%s::uuid, %s::uuid, %s::jsonb)",
            (job_id, lease_token, Jsonb(result or {})),
        )
        ok = bool(cur.fetchone()["complete_job"])
    conn.commit()
    return ok


def fail_job(
    conn: psycopg.Connection,
    job_id: str,
    lease_token: str,
    error: str,
    max_attempts: int = 3,
) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT app.fail_job(%s::uuid, %s::uuid, %s, %s)",
            (job_id, lease_token, error[:2000], max_attempts),
        )
        row = cur.fetchone()
        state = row["fail_job"] if row else None
    conn.commit()
    return state


def save_stage_output(
    conn: psycopg.Connection,
    job_id: str,
    stage: str,
    output: dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.job_stage_outputs (job_id, stage, output)
            VALUES (%s::uuid, %s, %s::jsonb)
            ON CONFLICT (job_id, stage) DO UPDATE
              SET output = EXCLUDED.output, created_at = now()
            """,
            (job_id, stage, Jsonb(output)),
        )
    conn.commit()


def get_stage_output(
    conn: psycopg.Connection,
    job_id: str,
    stage: str,
) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT output FROM public.job_stage_outputs
            WHERE job_id = %s::uuid AND stage = %s
            """,
            (job_id, stage),
        )
        row = cur.fetchone()
    if not row:
        return None
    out = row["output"]
    if isinstance(out, str):
        return json.loads(out)
    return dict(out)


def reserve_budget(
    conn: psycopg.Connection,
    job_id: str,
    provider: str,
    estimated_cost_cents: int,
    units: float | None = None,
) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT app.reserve_analysis_budget(%s::uuid, %s, %s, %s)",
            (job_id, provider, estimated_cost_cents, units),
        )
        usage_id = cur.fetchone()["reserve_analysis_budget"]
    conn.commit()
    return str(usage_id)


def settle_usage(
    conn: psycopg.Connection,
    usage_id: str,
    actual_cost_cents: int,
    units: float | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT app.settle_provider_usage(%s::uuid, %s, %s)",
            (usage_id, actual_cost_cents, units),
        )
    conn.commit()


def cancel_usage(conn: psycopg.Connection, usage_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT app.cancel_provider_usage(%s::uuid)", (usage_id,))
    conn.commit()


def expire_stale_reservations(conn: psycopg.Connection, max_age_seconds: int = 3600) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT app.expire_stale_reservations(%s)", (max_age_seconds,))
        n = int(cur.fetchone()["expire_stale_reservations"])
    conn.commit()
    return n
