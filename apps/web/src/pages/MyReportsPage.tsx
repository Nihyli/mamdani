import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SubmissionStatusResponse } from "@mamdani-ticketer/contracts";
import { ApiClientError, getSubmission } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PROCESSING_LABELS } from "../lib/labels";
import { EmptyState, ErrorState, LoadingState, Page } from "../components/Layout";

export function MyReportsPage() {
  const { submissionId } = useParams<{ submissionId?: string }>();
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <Page title="My reports" subtitle="Track your reports and see the latest updates.">
        <LoadingState />
      </Page>
    );
  }

  if (submissionId) {
    return <SubmissionStatusView id={submissionId} />;
  }

  if (!auth.userId) {
    return (
      <Page title="My reports" subtitle="Track your reports and see the latest updates.">
        <EmptyState
          title="Sign in to see your reports"
          body="Your submissions appear here after you sign in. There is no public list of other people’s drafts."
          action={
            <Link
              to="/sign-in?next=/my-reports"
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
            >
              Sign in
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page
      title="My reports"
      subtitle="Track your reports and see the latest updates."
      actions={
        <Link
          to="/submit"
          className="inline-flex min-h-10 items-center gap-1 rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white"
        >
          + Add a report
        </Link>
      }
    >
      <div className="mb-5 flex gap-4 border-b border-border text-sm font-semibold">
        <span className="border-b-2 border-cobalt pb-2 text-cobalt">Submitted</span>
        <span className="pb-2 text-muted">Following</span>
        <span className="pb-2 text-muted">Updates</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface mock-card-shadow">
        <div className="mock-map-art relative h-48 border-b border-border md:h-56">
          <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-surface/95 px-3 py-2 text-xs font-semibold shadow-sm">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-open" /> Open
            </span>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-pending" /> Pending
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fixed" /> Resolved
            </span>
          </div>
          <p className="absolute bottom-3 right-3 max-w-[10rem] text-right font-display text-sm italic text-ink/70">
            A cleaner brighter NYC together.
          </p>
        </div>

        <EmptyState
          title="No submission list yet"
          body="The API exposes a single-submission status page after you create a report. Open that link if you have a submission id, or add a new report."
          action={
            <Link
              to="/submit"
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
            >
              Add a report
            </Link>
          }
        />
      </div>
    </Page>
  );
}

function SubmissionStatusView({ id }: { id: string }) {
  const auth = useAuth();
  const [data, setData] = useState<SubmissionStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!auth.authHeaders) {
      setError("Sign in to view this submission.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await getSubmission(id, auth.authHeaders);
      setData(status);
    } catch (err) {
      setData(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load submission status.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.authHeaders, id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page title="Ready for review" subtitle="Track this submission through moderator review." narrow>
      <Link to="/my-reports" className="mb-4 inline-flex text-sm font-semibold text-cobalt">
        ← My reports
      </Link>

      {!auth.userId ? (
        <EmptyState
          title="Sign in required"
          body="This status page is only available to the account that created the submission."
          action={
            <Link
              to={`/sign-in?next=/my-reports/${id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
            >
              Sign in
            </Link>
          }
        />
      ) : null}

      {auth.userId && loading ? <LoadingState label="Loading status…" /> : null}
      {auth.userId && error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : null}
      {auth.userId && data ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <p className="text-xs text-muted">Submission {data.id}</p>
            <p className="mt-1 text-xl font-bold">
              {PROCESSING_LABELS[data.processingState]}
            </p>
            {data.title ? <p className="mt-1">{data.title}</p> : null}
            {data.needsInputMessage ? (
              <p className="mt-3 rounded-[8px] bg-pending/10 px-3 py-2 text-sm">
                {data.needsInputMessage}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-muted">
              Updated {new Date(data.updatedAt).toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <p className="mb-3 text-sm font-bold">What happens next?</p>
            <ol className="space-y-3 text-sm">
              <TimelineItem done label="Upload received" />
              <TimelineItem
                done={
                  data.processingState !== "draft" &&
                  data.processingState !== "queued"
                }
                label="Issue identified"
              />
              <TimelineItem
                done={
                  data.processingState === "accepted" ||
                  data.processingState === "pending_review"
                }
                active={data.processingState === "pending_review"}
                label="Moderator review pending"
              />
            </ol>
          </div>

          <div className="flex gap-3 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-3 text-sm">
            <span aria-hidden="true">🔔</span>
            <p>We will notify you when it is published.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center rounded-[8px] border border-border px-4 font-medium"
            >
              Refresh status
            </button>
            <Link
              to="/submit"
              className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
            >
              Submit another report
            </Link>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

function TimelineItem({
  label,
  done,
  active,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <li className={`flex items-center gap-3 ${done || active ? "text-ink" : "text-muted"}`}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-cobalt text-white"
            : active
              ? "border-2 border-cobalt text-cobalt"
              : "border border-border-strong bg-panel"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      {label}
    </li>
  );
}
