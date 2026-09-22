import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IssueCategory, NycBorough, PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { ApiClientError, listAllPublicIssues } from "../lib/api";
import { FilterBar, type MapFilters, type MapStatusFilter } from "../components/FilterBar";
import { IssueCard } from "../components/StatusBadge";
import { MapView } from "../components/MapView";
import { EmptyState, ErrorState, LoadingState } from "../components/Layout";
import { STATUS_LABELS } from "../lib/labels";

const DEFAULT_STATUSES: MapStatusFilter[] = ["open", "fix_pending"];

function parseStatuses(raw: string | null): MapStatusFilter[] {
  if (!raw) return DEFAULT_STATUSES;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is MapStatusFilter =>
      s === "open" || s === "fix_pending" || s === "resolved",
    );
  return parts.length ? parts : DEFAULT_STATUSES;
}

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const [issues, setIssues] = useState<PublicIssueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState<"collapsed" | "half" | "full">(
    "half",
  );

  const filters: MapFilters = useMemo(
    () => ({
      category: (params.get("category") as IssueCategory | null) || undefined,
      borough: (params.get("borough") as NycBorough | null) || undefined,
      statuses: parseStatuses(params.get("status")),
    }),
    [params],
  );

  const selectedId = params.get("report") ?? undefined;
  const view = params.get("view") === "list" ? "list" : "map";

  const setFilters = useCallback(
    (next: MapFilters) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.category) p.set("category", next.category);
          else p.delete("category");
          if (next.borough) p.set("borough", next.borough);
          else p.delete("borough");
          const defaultSet =
            next.statuses.length === 2 &&
            next.statuses.includes("open") &&
            next.statuses.includes("fix_pending") &&
            !next.statuses.includes("resolved");
          if (defaultSet) p.delete("status");
          else p.set("status", next.statuses.join(","));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setView = useCallback(
    (next: "map" | "list") => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "list") p.set("view", "list");
          else p.delete("view");
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const selectReport = useCallback(
    (id: string | undefined) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (id) p.set("report", id);
          else p.delete("report");
          return p;
        },
        { replace: true },
      );
      if (id) setSheetHeight("half");
    },
    [setParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch without single-status constraint, filter client-side for multi-status.
      const all = await listAllPublicIssues({
        category: filters.category,
        borough: filters.borough,
      });
      setIssues(
        all.filter((item) =>
          filters.statuses.includes(item.status as MapStatusFilter),
        ),
      );
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Could not load reports.";
      setError(message);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.borough, filters.statuses]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = issues.find((i) => i.id === selectedId);

  const listPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <LoadingState label="Loading reports…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error && issues.length === 0 ? (
          <EmptyState
            title="No reports match"
            body="Try clearing a filter, or add the first report for this view."
            action={
              <Link
                to="/submit"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-cobalt px-4 font-semibold text-white"
              >
                Add a report
              </Link>
            }
          />
        ) : null}
        {!loading &&
          !error &&
          issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              selected={issue.id === selectedId}
              onSelect={() => selectReport(issue.id)}
            />
          ))}
      </div>
      {selected ? (
        <div className="border-t border-border bg-canvas p-3">
          <p className="mb-1 text-xs font-medium text-muted">
            {STATUS_LABELS[selected.status as MapStatusFilter] ?? selected.status}
          </p>
          <p className="mb-2 font-semibold">{selected.title}</p>
          <Link
            to={selected.path}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-cobalt"
          >
            Open report
          </Link>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative h-[calc(100dvh-4.5rem)] md:h-[calc(100dvh-4.75rem)]">
      {/* Desktop */}
      <div className="hidden h-full md:flex">
        <div className="relative min-w-0 flex-1">
          {view === "map" ? (
            <MapView
              issues={issues}
              selectedId={selectedId}
              onSelect={selectReport}
            />
          ) : (
            <div className="h-full overflow-y-auto bg-canvas">{listPanel}</div>
          )}
        </div>
        {view === "map" ? (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-canvas">
            {listPanel}
          </aside>
        ) : null}
      </div>

      {/* Mobile */}
      <div className="flex h-full flex-col md:hidden">
        {view === "list" ? (
          <div className="min-h-0 flex-1 overflow-hidden">{listPanel}</div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-x-0 top-0 z-10">
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  view={view}
                  onViewChange={setView}
                />
              </div>
              <MapView
                issues={issues}
                selectedId={selectedId}
                onSelect={selectReport}
              />
            </div>
            <div
              className={`shrink-0 overflow-hidden border-t border-border bg-canvas transition-[height] ${
                sheetHeight === "collapsed"
                  ? "h-20"
                  : sheetHeight === "half"
                    ? "h-[45%]"
                    : "h-[85%]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <p className="text-sm font-medium">
                  {selected
                    ? selected.title
                    : loading
                      ? "Loading…"
                      : `${issues.length} nearby report${issues.length === 1 ? "" : "s"}`}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="min-h-11 min-w-11 text-sm text-muted"
                    onClick={() =>
                      setSheetHeight((h) =>
                        h === "collapsed" ? "half" : h === "half" ? "full" : "collapsed",
                      )
                    }
                  >
                    {sheetHeight === "full" ? "Less" : "More"}
                  </button>
                  {selected ? (
                    <button
                      type="button"
                      className="min-h-11 min-w-11 text-sm text-muted"
                      onClick={() => selectReport(undefined)}
                    >
                      Close
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="h-[calc(100%-3rem)] overflow-y-auto">
                {error ? (
                  <ErrorState message={error} onRetry={() => void load()} />
                ) : null}
                {selected ? (
                  <div className="p-3">
                    <IssueCard issue={selected} selected />
                    <Link
                      to={selected.path}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-cobalt font-semibold text-white"
                    >
                      Open report
                    </Link>
                  </div>
                ) : (
                  issues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onSelect={() => selectReport(issue.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
