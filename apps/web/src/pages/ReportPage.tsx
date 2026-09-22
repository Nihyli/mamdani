import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicIssue } from "@mamdani-ticketer/contracts";
import { ApiClientError, findPublicIssueByPath } from "../lib/api";
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

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [issue, setIssue] = useState<PublicIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [embedSource, setEmbedSource] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

      <div className="flex flex-wrap gap-2">
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
      </div>

      <p className="mt-6 text-sm text-muted">
        Publishing on {brand.shortName} does not submit a request to NYC 311.
      </p>
    </Page>
  );
}
