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
      <Page title="My reports">
        <LoadingState />
      </Page>
    );
  }

  if (submissionId) {
    return <SubmissionStatusView id={submissionId} />;
  }

  if (!auth.userId) {
    return (
      <Page title="My reports">
        <EmptyState
          title="Sign in to see your reports"
          body="Your submissions appear here after you sign in. There is no public list of other people’s drafts."
          action={
            <Link
              to="/sign-in?next=/my-reports"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-cobalt px-4 font-semibold text-white"
            >
              Sign in
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page title="My reports">
      <EmptyState
        title="No submission list yet"
        body="The API exposes GET /api/submissions/:id for a single report you just created, but no list endpoint. After you submit, you’ll land on that status page. Open a status link if you have a submission id."
        action={
          <Link
            to="/submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-cobalt px-4 font-semibold text-white"
          >
            Add a report
          </Link>
        }
      />
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
    <Page title="Submission status" narrow>
      {!auth.userId ? (
        <EmptyState
          title="Sign in required"
          body="This status page is only available to the account that created the submission."
          action={
            <Link
              to={`/sign-in?next=/my-reports/${id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-cobalt px-4 font-semibold text-white"
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
        <div className="space-y-4 rounded-md border border-border bg-white p-4">
          <p className="text-sm text-muted">Submission {data.id}</p>
          <p className="text-xl font-semibold">
            {PROCESSING_LABELS[data.processingState]}
          </p>
          {data.title ? <p>{data.title}</p> : null}
          {data.needsInputMessage ? (
            <p className="rounded-md bg-pending/10 px-3 py-2 text-sm">
              {data.needsInputMessage}
            </p>
          ) : null}
          <p className="text-sm text-muted">
            Stages shown honestly: Uploaded, Pending review, Needs more info,
            Published. There is no fake AI progress percentage.
          </p>
          <p className="text-sm text-muted">
            Updated {new Date(data.updatedAt).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
            >
              Refresh status
            </button>
            <Link
              to="/submit"
              className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white"
            >
              Submit another
            </Link>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
