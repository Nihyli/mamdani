import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  nycBoroughSchema,
  type AdminQueueItem,
  type NycBorough,
} from "@mamdani-ticketer/contracts";
import {
  ApiClientError,
  getAdminQueue,
  postAdminDecision,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  BOROUGH_LABELS,
  CATEGORY_LABELS,
  formatAge,
} from "../lib/labels";
import { MapView } from "../components/MapView";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
} from "../components/Layout";

const BOROUGHS = nycBoroughSchema.options;

export function AdminPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [borough, setBorough] = useState<NycBorough | "">("");
  const [pin, setPin] = useState<{ longitude: number; latitude: number } | null>(
    null,
  );
  const [needsInfoMessage, setNeedsInfoMessage] = useState("");
  const [showNeedsInfo, setShowNeedsInfo] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const onPinMove = useCallback((lng: number, lat: number) => {
    setPin({ longitude: lng, latitude: lat });
  }, []);

  const load = useCallback(async () => {
    if (!auth.authHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminQueue(auth.authHeaders);
      setItems(res.items);
      setSelectedId((prev) => {
        if (prev && res.items.some((item) => item.id === prev)) return prev;
        return res.items[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        navigate("/sign-in?next=/admin");
        return;
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load the review queue.",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [auth.authHeaders, navigate]);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.userId) {
      navigate("/sign-in?next=/admin");
      return;
    }
    void load();
  }, [auth.ready, auth.userId, load, navigate]);

  useEffect(() => {
    if (!selected) {
      setPin(null);
      setBorough("");
      setNeedsInfoMessage("");
      setShowNeedsInfo(false);
      setActionError(null);
      return;
    }
    setPin(selected.location ?? null);
    setBorough(selected.borough ?? "");
    setNeedsInfoMessage("");
    setShowNeedsInfo(false);
    setActionError(null);
  }, [selected]);

  async function decide(
    decision: "approve" | "reject" | "needs_info" | "verify_fix" | "reject_fix",
  ) {
    if (!selected || !auth.authHeaders) return;
    setActionError(null);

    if (selected.kind === "submission" && decision === "approve" && !borough) {
      setActionError("Choose a borough before publishing.");
      return;
    }
    if (decision === "needs_info" && !needsInfoMessage.trim()) {
      setActionError("Write a short message explaining what is missing.");
      return;
    }

    setBusy(true);
    try {
      const targetId =
        selected.kind === "fix_claim" && selected.issueId
          ? selected.issueId
          : selected.id;

      await postAdminDecision(
        targetId,
        {
          decision,
          expectedRevision: selected.revision,
          evidenceIds: [],
          ...(decision === "approve" && borough
            ? {
                borough,
                ...(pin
                  ? {
                      location: pin,
                      locationPrecision: "user_supplied" as const,
                    }
                  : {}),
              }
            : {}),
          ...(decision === "needs_info"
            ? { needsInfoMessage: needsInfoMessage.trim() }
            : {}),
        },
        auth.authHeaders,
      );

      setItems((prev) => {
        const next = prev.filter((item) => item.id !== selected.id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
      setShowNeedsInfo(false);
      setNeedsInfoMessage("");
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : "Decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected || busy) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (selected.kind === "submission") void decide("approve");
        else void decide("verify_fix");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (selected.kind === "submission") void decide("reject");
        else void decide("reject_fix");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (selected.kind === "submission") setShowNeedsInfo(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide closes over latest selected
  }, [selected, busy, borough, pin, needsInfoMessage]);

  if (!auth.ready || loading) {
    return (
      <Page title="Review queue">
        <LoadingState label="Loading queue…" />
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Review queue">
        <ErrorState message={error} onRetry={() => void load()} />
      </Page>
    );
  }

  if (items.length === 0) {
    return (
      <Page title="Review queue">
        <EmptyState
          title="Nothing to review"
          body="Pending submissions and fix evidence will show up here."
          action={
            <Link to="/" className="inline-flex min-h-11 items-center text-cobalt">
              Back to map
            </Link>
          }
        />
      </Page>
    );
  }

  const primaryMedia = selected?.media[0];
  const isVideo = primaryMedia?.mimeType.startsWith("video/");

  return (
    <Page title="Review queue">
      <p className="mb-4 text-sm text-muted">
        {items.length} item{items.length === 1 ? "" : "s"} · Shortcuts:{" "}
        <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-ink">
          A
        </kbd>{" "}
        approve ·{" "}
        <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-ink">
          R
        </kbd>{" "}
        reject
        {selected?.kind === "submission" ? (
          <>
            {" "}
            ·{" "}
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-ink">
              N
            </kbd>{" "}
            needs info
          </>
        ) : null}
      </p>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-md border border-border bg-white p-2">
          {items.map((item) => {
            const active = item.id === selectedId;
            const label =
              item.title?.trim() ||
              item.locationText?.trim() ||
              (item.kind === "fix_claim" ? "Fix evidence" : "Untitled submission");
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left",
                    active ? "bg-cobalt text-white" : "hover:bg-canvas",
                  ].join(" ")}
                >
                  <span className="text-sm font-medium leading-snug">{label}</span>
                  <span
                    className={[
                      "text-xs",
                      active ? "text-white/80" : "text-muted",
                    ].join(" ")}
                  >
                    {item.kind === "fix_claim" ? "Fix evidence" : "New report"}
                    {item.category
                      ? ` · ${CATEGORY_LABELS[item.category]}`
                      : ""}
                    {" · "}
                    {formatAge(item.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {selected.title?.trim() ||
                  selected.locationText?.trim() ||
                  (selected.kind === "fix_claim"
                    ? "Fix evidence"
                    : "Untitled submission")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {selected.kind === "fix_claim" ? "Fix evidence" : "New report"}
                {selected.category
                  ? ` · ${CATEGORY_LABELS[selected.category]}`
                  : ""}
                {selected.borough
                  ? ` · ${BOROUGH_LABELS[selected.borough]}`
                  : ""}
                {selected.locationText ? ` · ${selected.locationText}` : ""}
              </p>
              {selected.description ? (
                <p className="mt-2 whitespace-pre-wrap text-ink">
                  {selected.description}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-md border border-border bg-white">
                <p className="border-b border-border px-3 py-2 text-sm font-medium">
                  Evidence
                </p>
                {primaryMedia ? (
                  isVideo ? (
                    <video
                      src={primaryMedia.url}
                      controls
                      className="max-h-[360px] w-full bg-ink"
                    />
                  ) : (
                    <img
                      src={primaryMedia.url}
                      alt="Submission evidence"
                      className="max-h-[360px] w-full object-contain"
                    />
                  )
                ) : (
                  <p className="px-3 py-8 text-sm text-muted">
                    No uploaded media on this item.
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-white">
                <p className="border-b border-border px-3 py-2 text-sm font-medium">
                  Source
                </p>
                <div className="px-3 py-4">
                  {selected.sourceUrl ? (
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-cobalt underline-offset-2 hover:underline"
                    >
                      {selected.sourceUrl}
                    </a>
                  ) : (
                    <p className="text-sm text-muted">No source link provided.</p>
                  )}
                </div>
              </div>
            </div>

            {pin ? (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Location pin
                  {selected.kind === "submission"
                    ? " — drag to adjust before approve"
                    : ""}
                </p>
                <div className="h-64 overflow-hidden rounded-md border border-border">
                  <MapView
                    issues={[]}
                    onSelect={() => undefined}
                    interactivePin={pin}
                    onPinMove={
                      selected.kind === "submission" ? onPinMove : undefined
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No location pin on this item.</p>
            )}

            {selected.kind === "submission" ? (
              <div>
                <label htmlFor="borough" className="mb-2 block font-medium">
                  Borough (required to approve)
                </label>
                <select
                  id="borough"
                  value={borough}
                  onChange={(e) =>
                    setBorough((e.target.value || "") as NycBorough | "")
                  }
                  className="min-h-11 w-full max-w-xs rounded-md border border-border bg-white px-3"
                >
                  <option value="">Select borough…</option>
                  {BOROUGHS.map((b) => (
                    <option key={b} value={b}>
                      {BOROUGH_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showNeedsInfo && selected.kind === "submission" ? (
              <div>
                <label htmlFor="needs-info" className="mb-2 block font-medium">
                  Message to submitter
                </label>
                <textarea
                  id="needs-info"
                  value={needsInfoMessage}
                  onChange={(e) => setNeedsInfoMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                  placeholder="What should they fix or add?"
                />
              </div>
            ) : null}

            {actionError ? (
              <p role="alert" className="text-sm text-open">
                {actionError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {selected.kind === "submission" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("approve")}
                    className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("reject")}
                    className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium disabled:opacity-40"
                  >
                    Reject
                  </button>
                  {showNeedsInfo ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide("needs_info")}
                      className="inline-flex min-h-11 items-center rounded-md border border-pending px-4 font-medium text-pending disabled:opacity-40"
                    >
                      Send needs-info
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowNeedsInfo(true)}
                      className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium disabled:opacity-40"
                    >
                      Needs more info
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("verify_fix")}
                    className="inline-flex min-h-11 items-center rounded-md bg-fixed px-4 font-semibold text-white disabled:opacity-40"
                  >
                    Approve fix
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("reject_fix")}
                    className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium disabled:opacity-40"
                  >
                    Reject fix
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
