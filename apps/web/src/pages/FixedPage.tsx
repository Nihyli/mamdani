import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicIssue, PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { ApiClientError, getPublicIssue, listAllPublicIssues } from "../lib/api";
import { daysToVerifiedFixLabel, formatAge } from "../lib/labels";
import { EmptyState, ErrorState, LoadingState, Page } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";

type FixedCard = {
  list: PublicIssueListItem;
  detail?: PublicIssue;
};

export function FixedPage() {
  const [items, setItems] = useState<FixedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAllPublicIssues({ status: "resolved" });
      const withDetails = await Promise.all(
        list.map(async (item) => {
          try {
            const detail = await getPublicIssue(item.id);
            return { list: item, detail };
          } catch {
            return { list: item };
          }
        }),
      );
      setItems(withDetails);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load verified fixes.",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page title="Verified fixed">
      <p className="mb-6 max-w-2xl text-muted">
        Before/after evidence and the time from report to verified fix — not city
        response time.
      </p>

      {loading ? <LoadingState label="Loading fixed reports…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No verified fixes yet"
          body="When moderators verify a repair, it will show up here with the interval from the original report."
          action={
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 font-medium"
            >
              Browse open reports
            </Link>
          }
        />
      ) : null}

      <ul className="space-y-6">
        {items.map(({ list, detail }) => {
          const evidence = detail?.evidence ?? [];
          const before = evidence[0];
          const after = evidence.length > 1 ? evidence[evidence.length - 1] : null;
          const days =
            list.daysToVerifiedFix ??
            detail?.daysToVerifiedFix ??
            (list.resolvedAt
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(list.resolvedAt).getTime() -
                      new Date(list.createdAt).getTime()) /
                      86_400_000,
                  ),
                )
              : null);

          return (
            <li
              key={list.id}
              className="overflow-hidden rounded-md border border-border bg-white"
            >
              <div className="border-b border-border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status="resolved" />
                  <span className="text-sm text-muted">
                    Reported {formatAge(list.createdAt)}
                  </span>
                </div>
                <h2 className="text-lg font-semibold">
                  <Link to={list.path} className="hover:underline">
                    {list.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm font-medium text-fixed">
                  {daysToVerifiedFixLabel(days)}
                </p>
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <figure className="bg-canvas p-3">
                  <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Before
                  </figcaption>
                  {before ? (
                    before.kind === "video" ? (
                      <video src={before.url} controls className="aspect-video w-full bg-ink" />
                    ) : (
                      <img
                        src={before.url}
                        alt={`Before: ${list.title}`}
                        className="aspect-video w-full object-cover"
                      />
                    )
                  ) : list.thumbnailUrl ? (
                    <img
                      src={list.thumbnailUrl}
                      alt={`Before: ${list.title}`}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-muted">No before image</p>
                  )}
                </figure>
                <figure className="bg-canvas p-3">
                  <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    After
                  </figcaption>
                  {after && after.id !== before?.id ? (
                    after.kind === "video" ? (
                      <video src={after.url} controls className="aspect-video w-full bg-ink" />
                    ) : (
                      <img
                        src={after.url}
                        alt={`After: ${list.title}`}
                        className="aspect-video w-full object-cover"
                      />
                    )
                  ) : (
                    <p className="py-8 text-center text-sm text-muted">
                      No separate after evidence from the API yet
                    </p>
                  )}
                </figure>
              </div>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
