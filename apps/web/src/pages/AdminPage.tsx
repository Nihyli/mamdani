import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  nycBoroughSchema,
  type AdminQueueItem,
  type NycBorough,
} from "@mamdani-ticketer/contracts";
import {
  getAdminQueue,
  getAnalysisStatus,
  patchAnalysisSettings,
  postAdminDecision,
  ApiClientError,
} from "../lib/api";
import type { AnalysisStatus } from "@mamdani-ticketer/contracts";
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
} from "../components/Layout";

const BOROUGHS = nycBoroughSchema.options;

type Decision =
  | "approve"
  | "reject"
  | "needs_info"
  | "verify_fix"
  | "reject_fix"
  | "reopen";

function kindLabel(kind: AdminQueueItem["kind"]): string {
  if (kind === "fix_claim") return "Fix evidence";
  if (kind === "resolved") return "Verified fixed · reopen";
  return "New report";
}

function SpendWarningBanner({ analysis }: { analysis: AnalysisStatus }) {
  if (!analysis.dailySpendWarning && !analysis.monthlySpendWarning) return null;
  return (
    <span className="font-medium text-amber-800">
      Budget warning: daily{" "}
      {analysis.dailySpendWarning ? `${analysis.dailySpendWarning}%` : "ok"},
      monthly{" "}
      {analysis.monthlySpendWarning ? `${analysis.monthlySpendWarning}%` : "ok"}
    </span>
  );
}

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
  const [analysis, setAnalysis] = useState<AnalysisStatus | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const onPinMove = useCallback((lng: number, lat: number) => {
    setPin({ longitude: lng, latitude: lat });
  }, []);

  const load = useCallback(async () => {
    if (!auth.authHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const [res, analysisStatus] = await Promise.all([
        getAdminQueue(auth.authHeaders),
        getAnalysisStatus(auth.authHeaders).catch(() => null),
      ]);
      setItems(res.items);
      setAnalysis(analysisStatus);
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

  async function decide(decision: Decision) {
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
        else if (selected.kind === "fix_claim") void decide("verify_fix");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (selected.kind === "submission") void decide("reject");
        else if (selected.kind === "fix_claim") void decide("reject_fix");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (selected.kind === "submission") setShowNeedsInfo(true);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (selected.kind === "resolved") void decide("reopen");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide closes over latest selected
  }, [selected, busy, borough, pin, needsInfoMessage]);

  if (!auth.ready || loading) {
    return (
      <AdminShell>
        <LoadingState label="Loading queue…" />
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell>
        <ErrorState message={error} onRetry={() => void load()} />
      </AdminShell>
    );
  }

  if (items.length === 0) {
    return (
      <AdminShell>
        {analysis ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm mock-card-shadow">
            <span>
              Analysis:{" "}
              {!analysis.enabled
                ? "disabled"
                : analysis.paused
                  ? `paused${analysis.pauseReason ? ` (${analysis.pauseReason})` : ""}`
                  : "on"}
            </span>
            <span className="text-muted">
              Spend ${((analysis.dailySpendCents ?? 0) / 100).toFixed(2)} / $
              {(analysis.dailyCapCents / 100).toFixed(2)} today
            </span>
            <SpendWarningBanner analysis={analysis} />
          </div>
        ) : null}
        <EmptyState
          title="Nothing to review"
          body="Pending submissions, fix evidence, and reopen candidates will show up here."
          action={
            <Link to="/" className="inline-flex min-h-11 items-center text-cobalt">
              Back to map
            </Link>
          }
        />
      </AdminShell>
    );
  }

  const primaryMedia = selected?.media[0];
  const isVideo = primaryMedia?.mimeType.startsWith("video/");
  const submissions = items.filter((i) => i.kind === "submission").length;
  const fixClaims = items.filter((i) => i.kind === "fix_claim").length;
  const otherFlags = items.filter((i) => i.kind === "resolved").length;

  return (
    <AdminShell>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Moderation
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Review queue</h1>
      <p className="mt-1 text-sm text-muted">
        Check new reports, fix claims, and flags from the community.
      </p>

      <div className="mt-4 mb-5 flex flex-wrap gap-4 border-b border-border text-sm font-semibold">
        <span className="border-b-2 border-cobalt pb-2 text-cobalt">
          New reports ({submissions})
        </span>
        <span className="pb-2 text-muted">Fix claims ({fixClaims})</span>
        <span className="pb-2 text-muted">Flags ({otherFlags})</span>
      </div>

      <p className="mb-4 text-sm text-muted">
        {items.length} item{items.length === 1 ? "" : "s"} · Shortcuts:{" "}
        {selected?.kind === "resolved" ? (
          <>
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-ink">
              O
            </kbd>{" "}
            reopen
          </>
        ) : (
          <>
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
          </>
        )}
      </p>

      {analysis ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm mock-card-shadow">
          <span>
            Analysis:{" "}
            {!analysis.enabled
              ? "disabled"
              : analysis.paused
                ? `paused${analysis.pauseReason ? ` (${analysis.pauseReason})` : ""}`
                : "on"}
          </span>
          <span className="text-muted">
            Spend ${((analysis.dailySpendCents ?? 0) / 100).toFixed(2)} / $
            {(analysis.dailyCapCents / 100).toFixed(2)} today · $
            {((analysis.monthlySpendCents ?? 0) / 100).toFixed(2)} / $
            {(analysis.monthlyCapCents / 100).toFixed(2)} month
          </span>
          <SpendWarningBanner analysis={analysis} />
          {auth.authHeaders ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-9 rounded-[8px] border border-border bg-panel px-3 text-sm font-semibold hover:border-border-strong"
              onClick={() => {
                if (!auth.authHeaders || !analysis) return;
                setBusy(true);
                void patchAnalysisSettings(
                  {
                    analysisPaused: !analysis.paused,
                    pauseReason: analysis.paused ? null : "manual_pause",
                  },
                  auth.authHeaders,
                )
                  .then(setAnalysis)
                  .catch((err) =>
                    setActionError(
                      err instanceof ApiClientError
                        ? err.message
                        : "Could not update analysis settings.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {analysis.paused ? "Resume analysis" : "Pause analysis"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-surface p-2 mock-card-shadow">
          {items.map((item) => {
            const active = item.id === selectedId;
            const label =
              item.title?.trim() ||
              item.locationText?.trim() ||
              (item.kind === "fix_claim"
                ? "Fix evidence"
                : item.kind === "resolved"
                  ? "Verified fixed"
                  : "Untitled submission");
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    "flex w-full flex-col gap-0.5 rounded-[10px] px-3 py-2.5 text-left",
                    active ? "bg-cobalt/10 text-cobalt" : "hover:bg-panel",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold leading-snug text-ink">{label}</span>
                  <span className="text-xs text-muted">
                    {kindLabel(item.kind)}
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
          <div className="space-y-4 rounded-xl border border-border bg-surface p-4 mock-card-shadow sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-muted">
                  {selected.kind === "fix_claim"
                    ? `Fix claim #${selected.id.slice(0, 8)}`
                    : `Report #${selected.id.slice(0, 8)}`}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  {selected.title?.trim() ||
                    selected.locationText?.trim() ||
                    (selected.kind === "fix_claim"
                      ? "Fix evidence"
                      : selected.kind === "resolved"
                        ? "Verified fixed"
                        : "Untitled submission")}
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pending/30 bg-pending/10 px-2.5 py-1 text-xs font-semibold text-pending">
                {selected.kind === "fix_claim"
                  ? "Pending review"
                  : selected.location
                    ? "In review"
                    : "Location not verified"}
              </span>
            </div>

            <p className="text-sm text-muted">
              {kindLabel(selected.kind)}
              {selected.category
                ? ` · ${CATEGORY_LABELS[selected.category]}`
                : ""}
              {selected.borough
                ? ` · ${BOROUGH_LABELS[selected.borough]}`
                : ""}
              {selected.locationText ? ` · ${selected.locationText}` : ""}
            </p>
            {selected.description ? (
              <p className="whitespace-pre-wrap text-sm italic text-ink">
                “{selected.description}”
              </p>
            ) : null}

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-[8px] border border-border bg-panel px-3 py-2">
                <p className="text-xs text-muted">Category</p>
                <p className="font-semibold">
                  {selected.category
                    ? CATEGORY_LABELS[selected.category]
                    : "—"}
                </p>
              </div>
              <div className="rounded-[8px] border border-border bg-panel px-3 py-2">
                <p className="text-xs text-muted">Kind</p>
                <p className="font-semibold">{kindLabel(selected.kind)}</p>
              </div>
              <div className="rounded-[8px] border border-border bg-panel px-3 py-2">
                <p className="text-xs text-muted">Submitted</p>
                <p className="font-semibold">{formatAge(selected.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <p className="border-b border-border bg-panel px-3 py-2 text-sm font-bold">
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

              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <p className="border-b border-border bg-panel px-3 py-2 text-sm font-bold">
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
                <div className="h-64 overflow-hidden rounded-xl border border-border">
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

            {selected.kind === "submission" &&
            (selected.analysisProposal ||
              (selected.duplicateCandidates?.length ?? 0) > 0 ||
              (selected.locationCandidates?.length ?? 0) > 1) ? (
              <div className="space-y-3 rounded-xl border border-border bg-panel p-4">
                <h3 className="font-bold tracking-tight">
                  AI-detected evidence
                </h3>
                <p className="text-sm text-muted">
                  Proposal for the moderator only. The user-supplied location
                  above remains the primary pin.
                </p>

                {selected.analysisProposal ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Suggested title:</span>{" "}
                      {selected.analysisProposal.title}
                    </p>
                    <p>
                      <span className="font-medium">Category:</span>{" "}
                      {CATEGORY_LABELS[selected.analysisProposal.category]} ·{" "}
                      {selected.analysisProposal.actionability}
                    </p>
                    {selected.analysisProposal.transcript_excerpt ? (
                      <p className="whitespace-pre-wrap text-muted">
                        Transcript: {selected.analysisProposal.transcript_excerpt}
                      </p>
                    ) : null}
                    {selected.analysisProposal.missing_information.length > 0 ? (
                      <ul className="list-disc pl-5 text-muted">
                        {selected.analysisProposal.missing_information.map(
                          (item) => (
                            <li key={item}>{item}</li>
                          ),
                        )}
                      </ul>
                    ) : null}
                    {selected.analysisProposal.evidence_summaries.length > 0 ? (
                      <ul className="space-y-2">
                        {selected.analysisProposal.evidence_summaries.map(
                          (ev, idx) => (
                            <li
                              key={`${ev.type}-${idx}`}
                              className="flex items-start gap-2 rounded-[8px] border border-border bg-surface px-3 py-2"
                            >
                              <span className="text-fixed" aria-hidden="true">
                                ✓
                              </span>
                              <span>
                                <span className="font-semibold">{ev.type}</span>
                                <span className="block text-muted">{ev.summary}</span>
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : null}
                    {(selected.analysisProposal.provider_versions.transcription ||
                      ""
                    ).includes("mock") ||
                    selected.analysisProposal.evidence_summaries.some((e) =>
                      e.summary.includes("MOCK"),
                    ) ? (
                      <p className="rounded-[8px] bg-pending/10 px-2 py-1 text-xs text-pending">
                        LOCAL DEV / mock adapters were used for part of this
                        proposal.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    No analysis proposal yet (manual path or still processing).
                  </p>
                )}

                {(selected.locationCandidates?.length ?? 0) > 0 ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">
                      Location candidates
                    </p>
                    <ul className="space-y-1 text-sm">
                      {selected.locationCandidates.map((c) => (
                        <li key={c.id}>
                          {c.provider ?? "unknown"} · {c.precision} ·{" "}
                          {c.location.latitude.toFixed(5)},{" "}
                          {c.location.longitude.toFixed(5)}
                          {c.provider === "user" ? " (user pin)" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(selected.duplicateCandidates?.length ?? 0) > 0 ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">
                      Possible duplicates within 50 m
                    </p>
                    <ul className="space-y-1 text-sm">
                      {selected.duplicateCandidates.map((d) => (
                        <li key={d.issueId}>
                          <Link
                            to={d.path}
                            className="text-cobalt underline-offset-2 hover:underline"
                          >
                            {d.title}
                          </Link>{" "}
                          <span className="text-muted">
                            · {d.distanceMeters} m · {d.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

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
                  className="min-h-11 w-full max-w-xs rounded-[8px] border border-border bg-surface px-3"
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
                  className="w-full rounded-[8px] border border-border bg-surface px-3 py-2"
                  placeholder="What should they fix or add?"
                />
              </div>
            ) : null}

            {actionError ? (
              <p role="alert" className="text-sm text-open">
                {actionError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {selected.kind === "submission" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("approve")}
                    className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
                  >
                    ✓ Approve report
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("reject")}
                    className="inline-flex min-h-11 items-center rounded-[8px] border border-border bg-surface px-4 font-semibold disabled:opacity-40"
                  >
                    Reject
                  </button>
                  {showNeedsInfo ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide("needs_info")}
                      className="inline-flex min-h-11 items-center rounded-[8px] border border-pending px-4 font-semibold text-pending disabled:opacity-40"
                    >
                      Send needs-info
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowNeedsInfo(true)}
                      className="inline-flex min-h-11 items-center rounded-[8px] border border-cobalt/30 bg-surface px-4 font-semibold text-cobalt disabled:opacity-40"
                    >
                      Request info
                    </button>
                  )}
                </>
              ) : selected.kind === "fix_claim" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("verify_fix")}
                    className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
                  >
                    ✓ Approve fix
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("reject_fix")}
                    className="inline-flex min-h-11 items-center rounded-[8px] border border-border bg-surface px-4 font-semibold disabled:opacity-40"
                  >
                    Keep open
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("reopen")}
                  className="inline-flex min-h-11 items-center rounded-[8px] bg-open px-4 font-bold text-white disabled:opacity-40"
                >
                  Reopen as open
                </button>
              )}
              <p className="basis-full text-xs text-muted sm:basis-auto sm:ml-auto">
                {selected.kind === "fix_claim"
                  ? "All fixes are reviewed by a human. This decision is still pending."
                  : "A human review is required before publishing."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-panel px-4 py-6 lg:block">
        <p className="font-display text-lg font-bold leading-tight">Mamdani, Fix This</p>
        <p className="mt-1 text-xs text-muted">A cleaner, kinder New York — together.</p>
        <nav className="mt-6 space-y-1 text-sm font-semibold">
          <span className="flex items-center gap-2 rounded-[8px] bg-cobalt/10 px-3 py-2 text-cobalt">
            Reviews
          </span>
          <span className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-muted">
            Reports
          </span>
          <span className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-muted">
            Safety
          </span>
          <Link
            to="/settings"
            className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-muted hover:bg-border/40 hover:text-ink"
          >
            Settings
          </Link>
        </nav>
        <div className="mt-10 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
          <p className="font-semibold text-fixed">New York works better together</p>
        </div>
      </aside>
      <div className="px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
