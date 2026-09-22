import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicIssue, PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { ApiClientError, getPublicIssue, listAllPublicIssues } from "../lib/api";
import { BOROUGH_LABELS, CATEGORY_LABELS, formatAge } from "../lib/labels";
import { EmptyState, ErrorState, LoadingState, Page } from "../components/Layout";

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

  const fixDays = useMemo(
    () =>
      items
        .map(({ list, detail }) => {
          if (list.daysToVerifiedFix != null) return list.daysToVerifiedFix;
          if (detail?.daysToVerifiedFix != null) return detail.daysToVerifiedFix;
          if (!list.resolvedAt) return null;
          return Math.max(
            0,
            Math.round(
              (new Date(list.resolvedAt).getTime() -
                new Date(list.createdAt).getTime()) /
                86_400_000,
            ),
          );
        })
        .filter((days): days is number => days != null)
        .sort((a, b) => a - b),
    [items],
  );
  const medianDays =
    fixDays.length > 0 ? fixDays[Math.floor((fixDays.length - 1) / 2)] : null;

  return (
    <Page
      title="The fixed feed"
      subtitle="Real problems. Real progress. A cleaner, safer, kinder NYC — one fix at a time."
      actions={
        <div className="inline-flex items-center gap-3 rounded-xl border border-fixed/20 bg-fixed/10 px-4 py-3 text-sm font-semibold text-fixed">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fixed text-white" aria-hidden="true">
            ✓
          </span>
          <span>
            <span className="block text-lg font-bold leading-none text-ink">{items.length.toLocaleString()}</span>
            Issues marked fixed
            {medianDays != null ? (
              <span className="block text-xs font-medium text-muted">
                median {medianDays} day{medianDays === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="inline-flex min-h-9 items-center rounded-full bg-fixed px-3 text-sm font-semibold text-white">
          Fixed
        </span>
        <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-muted">
          All
        </span>
        <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-muted">
          Streets & sidewalks
        </span>
        <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-muted">
          Parks
        </span>
        <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-muted">
          Trash & sanitation
        </span>
      </div>

      {loading ? <LoadingState label="Loading fixed reports…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No verified fixes yet"
          body="When moderators verify a repair, it will show up here with the interval from the original report."
          action={
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-border bg-white px-4 font-medium"
            >
              Browse open reports
            </Link>
          }
        />
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map(({ list, detail }) => {
          const evidence = detail?.evidence ?? [];
          const before = evidence[0];
          const after = evidence.length > 1 ? evidence[evidence.length - 1] : null;
          const fixedLabel = list.resolvedAt
            ? `Fixed ${new Date(list.resolvedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`
            : "Verified fixed";

          return (
            <li
              key={list.id}
              className="overflow-hidden rounded-xl border border-border bg-surface mock-card-shadow"
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-fixed/10 px-2.5 py-1 text-xs font-semibold text-fixed">
                  <span aria-hidden="true">✓</span> Verified fixed
                </span>
                <span className="text-xs text-muted">{fixedLabel}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 px-4">
                <figure className="relative overflow-hidden rounded-[8px] bg-panel">
                  {before ? (
                    before.kind === "video" ? (
                      <video src={before.url} className="aspect-[4/3] w-full object-cover" muted />
                    ) : (
                      <img
                        src={before.url}
                        alt={`Before: ${list.title}`}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    )
                  ) : list.thumbnailUrl ? (
                    <img
                      src={list.thumbnailUrl}
                      alt={`Before: ${list.title}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-xs text-muted">
                      No before
                    </div>
                  )}
                  <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Before
                  </figcaption>
                </figure>
                <figure className="relative overflow-hidden rounded-[8px] bg-panel">
                  {after && after.id !== before?.id ? (
                    after.kind === "video" ? (
                      <video src={after.url} className="aspect-[4/3] w-full object-cover" muted />
                    ) : (
                      <img
                        src={after.url}
                        alt={`After: ${list.title}`}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-xs text-muted">
                      No after yet
                    </div>
                  )}
                  <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    After
                  </figcaption>
                </figure>
              </div>

              <div className="p-4">
                <h2 className="text-lg font-bold leading-tight tracking-tight">
                  <Link to={list.path} className="hover:underline">
                    {list.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-muted">
                  📍 {BOROUGH_LABELS[list.borough]}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Reported {formatAge(list.createdAt)}
                  {list.resolvedAt
                    ? ` · Fixed ${formatAge(list.resolvedAt)}`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-muted">
                      {CATEGORY_LABELS[list.category]}
                    </span>
                    <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-muted">
                      {BOROUGH_LABELS[list.borough]}
                    </span>
                  </div>
                  <Link
                    to={list.path}
                    className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-border px-3 text-xs font-semibold"
                  >
                    Share
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
