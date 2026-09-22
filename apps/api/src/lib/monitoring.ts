/**
 * Error / ops monitoring (SPEC §16, M3).
 * Local structured log sink always on; Sentry (or similar) when DSN is real.
 */

export type MonitorEvent = {
  level: "info" | "warn" | "error";
  message: string;
  requestId?: string;
  jobId?: string;
  code?: string;
  extra?: Record<string, unknown>;
};

type Sink = (event: MonitorEvent) => void | Promise<void>;

const localSink: Sink = (event) => {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
  });
  if (event.level === "error") console.error(line);
  else if (event.level === "warn") console.warn(line);
  else console.log(line);
};

let remoteHook: Sink | null = null;

export function configureMonitoring(
  env: Record<string, string | undefined> = process.env,
): { provider: "local" | "sentry"; configured: boolean } {
  const dsn = env.SENTRY_DSN?.trim();
  if (dsn && !dsn.startsWith("your-") && dsn.includes("http")) {
    remoteHook = async (event) => {
      // Minimal production hook: POST a JSON envelope-like payload when DSN is set.
      // Avoid shipping secrets; only safe fields.
      try {
        await fetch(dsn.replace(/\/$/, "") + "/api/store/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: event.message,
            level: event.level,
            tags: { code: event.code, requestId: event.requestId },
            extra: event.extra,
          }),
        });
      } catch {
        // never throw from monitoring
      }
    };
    return { provider: "sentry", configured: true };
  }
  remoteHook = null;
  return { provider: "local", configured: true };
}

export async function reportEvent(event: MonitorEvent): Promise<void> {
  localSink(event);
  if (remoteHook) {
    try {
      await remoteHook(event);
    } catch {
      /* ignore */
    }
  }
}

export function monitoringStatus(
  env: Record<string, string | undefined> = process.env,
): { provider: "local" | "sentry"; remoteConfigured: boolean } {
  const dsn = env.SENTRY_DSN?.trim();
  const remoteConfigured = Boolean(
    dsn && !dsn.startsWith("your-") && dsn.includes("http"),
  );
  return {
    provider: remoteConfigured ? "sentry" : "local",
    remoteConfigured,
  };
}
