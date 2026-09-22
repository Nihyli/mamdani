import type { ErrorCode } from "@mamdani-ticketer/contracts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

type PgLike = { code?: string; message?: string };

/** Map Postgres errors raised by transition / unique constraints. */
export function mapDatabaseError(
  err: unknown,
): { status: number; code: ErrorCode; message: string } | null {
  if (!err || typeof err !== "object") return null;
  const pg = err as PgLike;
  const message = pg.message ?? "";
  const code = pg.code ?? "";

  if (code === "23P01" || /revision conflict/i.test(message)) {
    return {
      status: 409,
      code: "revision_conflict",
      message: "This record changed since you opened it. Reload and try again.",
    };
  }
  if (/invalid status transition/i.test(message)) {
    return {
      status: 409,
      code: "invalid_status_transition",
      message: "That status change is not allowed from the current state.",
    };
  }
  if (code === "23505" && /source_posts_platform_post_unique/i.test(message)) {
    return {
      status: 409,
      code: "duplicate_source",
      message: "This source is already recorded.",
    };
  }
  if (code === "23505" && /submissions_owner_idempotency_unique/i.test(message)) {
    return {
      status: 409,
      code: "idempotency_conflict",
      message: "This idempotency key was already used with a different payload.",
    };
  }
  if (code === "P0002" || /issue not found/i.test(message)) {
    return { status: 404, code: "not_found", message: "Issue not found." };
  }
  return null;
}
