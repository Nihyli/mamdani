import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PublicIssue } from "@mamdani-ticketer/contracts";
import {
  ApiClientError,
  completeUpload,
  createIssueUpdate,
  findPublicIssueByPath,
  setIssueSupport,
  sha256Hex,
  signUpload,
  uploadBytesWithProgress,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { brand, disclaimer } from "../lib/brand";
import {
  BOROUGH_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  daysToVerifiedFixLabel,
  formatAge,
  isPublicMapStatus,
} from "../lib/labels";
import { ErrorState, LoadingState, Page } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { MapView } from "../components/MapView";

function setMetaProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<PublicIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [embedSource, setEmbedSource] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [supported, setSupported] = useState(false);
  const [supportCount, setSupportCount] = useState(0);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  const [showFixForm, setShowFixForm] = useState(false);
  const [fixFile, setFixFile] = useState<File | null>(null);
  const [observedAt, setObservedAt] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [sameLocation, setSameLocation] = useState(true);
  const [rightsAttested, setRightsAttested] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixSuccess, setFixSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const found = await findPublicIssueByPath(`/r/${slug}`);
      if (!found) {
        setIssue(null);
        setError("Report not found.");
      } else {
        setIssue(found);
        setSupportCount(found.supportCount);
        setSupported(false);
      }
    } catch (err) {
      setIssue(null);
      setError(
        err instanceof ApiClientError ? err.message : "Could not load report.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!issue) return;
    const status = isPublicMapStatus(issue.status) ? issue.status : "open";
    const statusLabel = STATUS_LABELS[status];
    const boroughLabel = BOROUGH_LABELS[issue.borough] ?? issue.borough;
    const description = [
      `${statusLabel}. ${boroughLabel}.`,
      disclaimer,
    ].join(" ");
    const url = `${window.location.origin}${issue.path}`;
    const prevTitle = document.title;
    document.title = `${issue.title} · ${brand.name}`;
    setMetaName("description", description);
    setMetaProperty("og:title", issue.title);
    setMetaProperty("og:description", description);
    setMetaProperty("og:url", url);
    return () => {
      document.title = prevTitle || brand.name;
    };
  }, [issue]);

  async function share() {
    if (!issue) return;
    const url = `${window.location.origin}${issue.path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: issue.title, url });
        return;
      }
    } catch {
      /* fall through to copy */
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function toggleSupport() {
    if (!issue) return;
    if (!auth.authHeaders) {
      navigate(`/sign-in?next=${encodeURIComponent(issue.path)}`);
      return;
    }
    setSupportBusy(true);
    setSupportError(null);
    const next = !supported;
    try {
      const res = await setIssueSupport(issue.id, next, auth.authHeaders);
      setSupported(res.supported);
      setSupportCount(res.supportCount);
    } catch (err) {
      setSupportError(
        err instanceof ApiClientError ? err.message : "Could not update support.",
      );
    } finally {
      setSupportBusy(false);
    }
  }

  function onFixFileChange(file: File | null) {
    setFixError(null);
    if (!file) {
      setFixFile(null);
      return;
    }
    if (!ALLOWED.has(file.type)) {
      setFixError("Use JPEG, PNG, WebP, or MP4.");
      return;
    }
    const max = file.type.startsWith("video/") ? MAX_VIDEO : MAX_PHOTO;
    if (file.size > max) {
      setFixError(
        file.type.startsWith("video/")
          ? "Video must be 50 MB or smaller."
          : "Photo must be 10 MB or smaller.",
      );
      return;
    }
    setFixFile(file);
  }

  async function submitFix(e: FormEvent) {
    e.preventDefault();
    if (!issue) return;
    if (!auth.authHeaders) {
      navigate(`/sign-in?next=${encodeURIComponent(issue.path)}`);
      return;
    }
    if (!observedAt) {
      setFixError("Add the date you saw the repair.");
      return;
    }
    if (!sameLocation) {
      setFixError("Confirm this update is for the same location.");
      return;
    }
    if (!rightsAttested) {
      setFixError("Confirm you have the rights to submit this evidence.");
      return;
    }

    setFixBusy(true);
    setFixError(null);
    setFixSuccess(null);
    setUploadProgress(fixFile ? 0 : null);

    try {
      const mediaIds: string[] = [];
      if (fixFile) {
        const signed = await signUpload(
          {
            mimeType: fixFile.type,
            byteSize: fixFile.size,
            filename: fixFile.name,
          },
          auth.authHeaders,
        );
        await uploadBytesWithProgress(
          signed.uploadUrl,
          fixFile,
          signed.headers,
          (ratio) => setUploadProgress(ratio),
        );
        const digest = await sha256Hex(fixFile);
        await completeUpload(signed.mediaId, auth.authHeaders, digest);
        mediaIds.push(signed.mediaId);
      }

      const observedIso = new Date(`${observedAt}T12:00:00.000Z`).toISOString();
      await createIssueUpdate(
        issue.id,
        {
          kind: "fix_claim",
          observedAt: observedIso,
          rightsAttested: true,
          mediaIds,
          ...(fixNote.trim() ? { body: fixNote.trim() } : {}),
        },
        auth.authHeaders,
      );

      setFixSuccess("Fix evidence submitted for review.");
      setShowFixForm(false);
      setFixFile(null);
      setObservedAt("");
      setFixNote("");
      setRightsAttested(false);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        navigate(`/sign-in?next=${encodeURIComponent(issue.path)}`);
        return;
      }
      setFixError(
        err instanceof ApiClientError
          ? err.message
          : "Could not submit fix evidence.",
      );
    } finally {
      setFixBusy(false);
      setUploadProgress(null);
    }
  }

  if (loading) {
    return (
      <Page>
        <LoadingState label="Loading report…" />
      </Page>
    );
  }

  if (error || !issue) {
    return (
      <Page>
        <ErrorState message={error ?? "Report not found."} onRetry={() => void load()} />
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-cobalt">
          ← Back to map
        </Link>
      </Page>
    );
  }

  const status = isPublicMapStatus(issue.status) ? issue.status : "open";
  const primaryEvidence = issue.evidence.find((e) => e.kind === "image") ?? issue.evidence[0];
  const tiktok = issue.sources.find((s) => s.platform.toLowerCase().includes("tiktok"));
  const canReportFix = status === "open" || status === "fix_pending";
  const locationLabel = `${BOROUGH_LABELS[issue.borough]}`;

  if (showFixForm) {
    return (
      <Page narrow>
        <Link
          to={issue.path}
          onClick={(e) => {
            e.preventDefault();
            setShowFixForm(false);
          }}
          className="mb-4 inline-flex min-h-10 items-center text-sm font-semibold text-cobalt"
        >
          ← Back to issue
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">Report a fix</h1>
        <p className="mt-2 text-muted">
          Share an update if this issue has been fixed or improved.
        </p>

        <div className="mt-5 flex gap-3 rounded-xl border border-border bg-surface p-3 mock-card-shadow">
          {primaryEvidence?.kind === "image" ? (
            <img
              src={primaryEvidence.url}
              alt=""
              className="h-14 w-14 rounded-[8px] object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-[8px] bg-panel text-[10px] text-muted">
              Issue
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="truncate font-bold">{issue.title}</p>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted">{locationLabel}</p>
          </div>
        </div>

        <form onSubmit={(e) => void submitFix(e)} className="mt-5 space-y-4">
          <div>
            <label htmlFor="fix-photo" className="mb-2 block text-sm font-semibold">
              Add a recent photo or video
            </label>
            <label
              htmlFor="fix-photo"
              className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-panel px-4 py-6 text-center"
            >
              <span className="text-sm font-medium text-cobalt">click to upload</span>
              <span className="mt-1 text-xs text-muted">
                Photos or videos help us verify the fix. Max 50 MB video / 10 MB photo.
              </span>
              <input
                id="fix-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={(e) => onFixFileChange(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
            {fixFile ? (
              <p className="mt-2 text-sm text-muted">{fixFile.name}</p>
            ) : null}
            {uploadProgress != null ? (
              <p className="mt-1 text-sm text-muted">
                Uploading… {Math.round(uploadProgress * 100)}%
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="observed-at" className="mb-2 block text-sm font-semibold">
              Date observed *
            </label>
            <input
              id="observed-at"
              type="date"
              required
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border px-3"
            />
          </div>

          <div>
            <label htmlFor="fix-note" className="mb-2 block text-sm font-semibold">
              Add a short note (optional)
            </label>
            <textarea
              id="fix-note"
              value={fixNote}
              onChange={(e) => setFixNote(e.target.value.slice(0, 280))}
              rows={3}
              maxLength={280}
              placeholder="e.g. The pothole has been filled and the street looks much better now."
              className="w-full rounded-[8px] border border-border px-3 py-2"
            />
            <p className="mt-1 text-right text-xs text-muted">{fixNote.length}/280</p>
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cobalt"
              checked={sameLocation}
              onChange={(e) => setSameLocation(e.target.checked)}
            />
            <span className="text-sm">
              Confirm this is the same location ({locationLabel})
            </span>
          </label>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cobalt"
              checked={rightsAttested}
              onChange={(e) => setRightsAttested(e.target.checked)}
            />
            <span className="text-sm">
              I have the rights to share this evidence and it shows a recent repair.
            </span>
          </label>

          <div className="flex gap-3 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-3 text-sm text-ink">
            <span className="font-bold text-cobalt" aria-hidden="true">
              i
            </span>
            <p>
              Your update will be reviewed before this report is marked fixed. We may
              reach out if we need more information.
            </p>
          </div>

          {fixError ? (
            <p role="alert" className="text-sm text-open">
              {fixError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={fixBusy || !rightsAttested || !observedAt || !sameLocation}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
          >
            {fixBusy ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      </Page>
    );
  }

  return (
    <Page>
      <Link to="/" className="mb-4 inline-flex min-h-10 items-center text-sm font-semibold text-cobalt">
        ← Back to map
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 md:hidden">
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
              {issue.title}
            </h1>
            <StatusBadge status={status} />
          </div>
          <h1 className="hidden font-display text-3xl font-bold leading-tight tracking-tight md:block md:text-4xl">
            {issue.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span aria-hidden="true">📍</span>
            <span className="font-semibold text-ink">{BOROUGH_LABELS[issue.borough]}</span>
            <span>· {CATEGORY_LABELS[issue.category]}</span>
          </p>
        </div>
        <div className="hidden shrink-0 text-right md:block">
          <StatusBadge status={status} />
          <p className="mt-2 text-xs text-muted">
            Reported {formatAge(issue.createdAt)}
            {issue.shortId ? ` · #${issue.shortId}` : ""}
          </p>
          {issue.daysToVerifiedFix != null ? (
            <p className="mt-1 text-xs font-semibold text-fixed">
              {daysToVerifiedFixLabel(issue.daysToVerifiedFix)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          {primaryEvidence ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-white mock-card-shadow">
              {primaryEvidence.kind === "video" ? (
                <video
                  src={primaryEvidence.url}
                  controls
                  className="max-h-[460px] w-full bg-ink"
                />
              ) : (
                <img
                  src={primaryEvidence.url}
                  alt={primaryEvidence.summary || `Evidence for ${issue.title}`}
                  className="max-h-[460px] w-full object-contain"
                />
              )}
              {tiktok ? (
                <div className="absolute bottom-3 left-3">
                  {embedSource === tiktok.url ? (
                    <a
                      href={tiktok.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center rounded-full bg-ink/85 px-3 text-xs font-semibold text-white"
                    >
                      Open on TikTok ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center rounded-full bg-ink/85 px-3 text-xs font-semibold text-white"
                      onClick={() => setEmbedSource(tiktok.url)}
                    >
                      View original TikTok ↗
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border-strong bg-panel px-4 py-8 text-center text-muted">
              No public evidence image yet.
            </p>
          )}

          {issue.description ? (
            <section className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
              <h2 className="mb-2 text-sm font-bold">Why this location?</h2>
              <p className="whitespace-pre-wrap text-sm text-ink">{issue.description}</p>
              {tiktok ? (
                <p className="mt-3 text-sm">
                  <span className="text-muted">Source: </span>
                  <a
                    href={tiktok.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-cobalt underline-offset-2 hover:underline"
                  >
                    TikTok video ↗
                  </a>
                </p>
              ) : null}
            </section>
          ) : null}

          {supportError ? (
            <p role="alert" className="text-sm text-open">
              {supportError}
            </p>
          ) : null}
          {fixSuccess ? (
            <p role="status" className="text-sm text-fixed">
              {fixSuccess}
            </p>
          ) : null}

          {canReportFix ? (
            <button
              type="button"
              onClick={() => {
                if (!auth.userId) {
                  navigate(`/sign-in?next=${encodeURIComponent(issue.path)}`);
                  return;
                }
                setShowFixForm(true);
                setFixError(null);
                setFixSuccess(null);
              }}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8]"
            >
              🔧 Report a fix
            </button>
          ) : null}

          <p className="text-sm text-muted">
            Publishing on {brand.shortName} does not submit a request to NYC 311.
          </p>
        </div>

        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-surface mock-card-shadow">
            <div className="h-44">
              <MapView
                issues={[]}
                onSelect={() => undefined}
                interactivePin={{
                  longitude: issue.location.longitude,
                  latitude: issue.location.latitude,
                }}
                className="h-full w-full"
              />
            </div>
            <p className="border-t border-border px-3 py-3 text-sm text-ink">
              <span aria-hidden="true">📍 </span>
              {BOROUGH_LABELS[issue.borough]}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 text-center mock-card-shadow">
            <p className="text-3xl" aria-hidden="true">
              ♥
            </p>
            <p className="mt-1 text-2xl font-bold">{supportCount}</p>
            <p className="mt-1 text-sm text-muted">
              Neighbors agree this needs attention.
            </p>
            <button
              type="button"
              disabled={supportBusy}
              onClick={() => void toggleSupport()}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-cobalt/30 bg-cobalt/5 px-4 font-semibold text-cobalt disabled:opacity-40"
              aria-pressed={supported}
            >
              {supported ? "Supporting" : "♡ Add your support"}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <p className="mb-3 text-sm font-bold">Share</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted">
              <button
                type="button"
                onClick={() => void share()}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-ink">
                  ↗
                </span>
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${window.location.origin}${issue.path}`)}&text=${encodeURIComponent(issue.title)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-ink">
                  𝕏
                </span>
                X
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}${issue.path}`)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-ink">
                  f
                </span>
                Facebook
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(issue.title)}&body=${encodeURIComponent(`${window.location.origin}${issue.path}`)}`}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-ink">
                  ✉
                </span>
                Email
              </a>
            </div>
            <Link
              to={`/report-content?url=${encodeURIComponent(`${window.location.origin}${issue.path}`)}`}
              className="mt-3 inline-flex text-xs font-semibold text-muted underline-offset-2 hover:underline"
            >
              Report content
            </Link>
          </div>
        </aside>
      </div>
    </Page>
  );
}
