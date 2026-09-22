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
import { brand } from "../lib/brand";
import {
  BOROUGH_LABELS,
  CATEGORY_LABELS,
  daysToVerifiedFixLabel,
  formatAge,
  isPublicMapStatus,
} from "../lib/labels";
import { ErrorState, LoadingState, Page } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";

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
          Back to map
        </Link>
      </Page>
    );
  }

  const status = isPublicMapStatus(issue.status) ? issue.status : "open";
  const primaryEvidence = issue.evidence.find((e) => e.kind === "image") ?? issue.evidence[0];
  const tiktok = issue.sources.find((s) => s.platform.toLowerCase().includes("tiktok"));
  const canReportFix = status === "open" || status === "fix_pending";

  return (
    <Page narrow>
      <p className="mb-2 text-sm text-muted">
        {CATEGORY_LABELS[issue.category]} · {BOROUGH_LABELS[issue.borough]} ·{" "}
        {formatAge(issue.createdAt)}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {issue.daysToVerifiedFix != null ? (
          <span className="text-sm text-muted">
            {daysToVerifiedFixLabel(issue.daysToVerifiedFix)}
          </span>
        ) : null}
      </div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{issue.title}</h1>
      {issue.description ? (
        <p className="mb-4 whitespace-pre-wrap text-ink">{issue.description}</p>
      ) : null}

      {primaryEvidence ? (
        <div className="mb-4 overflow-hidden rounded-md border border-border bg-white">
          {primaryEvidence.kind === "video" ? (
            <video
              src={primaryEvidence.url}
              controls
              className="max-h-[420px] w-full bg-ink"
            />
          ) : (
            <img
              src={primaryEvidence.url}
              alt={primaryEvidence.summary || `Evidence for ${issue.title}`}
              className="max-h-[420px] w-full object-contain"
            />
          )}
        </div>
      ) : (
        <p className="mb-4 text-muted">No public evidence image yet.</p>
      )}

      {tiktok ? (
        <div className="mb-4 rounded-md border border-border bg-white p-3">
          <p className="mb-2 text-sm font-medium">Source</p>
          {embedSource === tiktok.url ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">
                TikTok may receive your IP address and browser information.
              </p>
              <a
                href={tiktok.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center font-medium text-cobalt underline-offset-2 hover:underline"
              >
                Open on TikTok
              </a>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
              onClick={() => setEmbedSource(tiktok.url)}
            >
              Load TikTok video
            </button>
          )}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          to={`/?report=${issue.id}`}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium"
        >
          View on map
        </Link>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white"
        >
          {copied ? "Link copied" : "Share / copy link"}
        </button>
        <button
          type="button"
          disabled={supportBusy}
          onClick={() => void toggleSupport()}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium disabled:opacity-40"
          aria-pressed={supported}
        >
          {supported ? "Supporting" : "Support"} · {supportCount}
        </button>
        {canReportFix ? (
          <button
            type="button"
            onClick={() => {
              if (!auth.userId) {
                navigate(`/sign-in?next=${encodeURIComponent(issue.path)}`);
                return;
              }
              setShowFixForm((v) => !v);
              setFixError(null);
              setFixSuccess(null);
            }}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium"
          >
            Report a fix
          </button>
        ) : null}
      </div>

      {supportError ? (
        <p role="alert" className="mb-4 text-sm text-open">
          {supportError}
        </p>
      ) : null}
      {fixSuccess ? (
        <p role="status" className="mb-4 text-sm text-fixed">
          {fixSuccess}
        </p>
      ) : null}

      {showFixForm ? (
        <form
          onSubmit={(e) => void submitFix(e)}
          className="mb-6 space-y-4 rounded-md border border-border bg-white p-4"
        >
          <h2 className="text-lg font-semibold">Report a fix</h2>
          <p className="text-sm text-muted">
            Upload recent evidence that this issue looks repaired. A moderator
            verifies before the status changes to verified fixed.
          </p>

          <div>
            <label htmlFor="observed-at" className="mb-2 block font-medium">
              Date you saw the repair
            </label>
            <input
              id="observed-at"
              type="date"
              required
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border px-3"
            />
          </div>

          <div>
            <label htmlFor="fix-photo" className="mb-2 block font-medium">
              Photo or video (optional)
            </label>
            <input
              id="fix-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              onChange={(e) => onFixFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {fixFile ? (
              <p className="mt-1 text-sm text-muted">{fixFile.name}</p>
            ) : null}
            {uploadProgress != null ? (
              <p className="mt-1 text-sm text-muted">
                Uploading… {Math.round(uploadProgress * 100)}%
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fix-note" className="mb-2 block font-medium">
              Note (optional)
            </label>
            <textarea
              id="fix-note"
              value={fixNote}
              onChange={(e) => setFixNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border px-3 py-2"
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={rightsAttested}
              onChange={(e) => setRightsAttested(e.target.checked)}
            />
            <span className="text-sm">
              I have the rights to share this evidence and it shows a recent
              repair at this location.
            </span>
          </label>

          {fixError ? (
            <p role="alert" className="text-sm text-open">
              {fixError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={fixBusy || !rightsAttested || !observedAt}
              className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
            >
              {fixBusy ? "Submitting…" : "Submit fix evidence"}
            </button>
            <button
              type="button"
              onClick={() => setShowFixForm(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <p className="mt-6 text-sm text-muted">
        Publishing on {brand.shortName} does not submit a request to NYC 311.
      </p>
    </Page>
  );
}
