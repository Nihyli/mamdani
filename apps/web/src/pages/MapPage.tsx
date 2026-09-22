import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IssueCategory, NycBorough, PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { ApiClientError, listAllPublicIssues, fetchPublicSnapshot } from "../lib/api";
import { FilterBar, type MapFilters, type MapStatusFilter } from "../components/FilterBar";
import { IssueCard } from "../components/StatusBadge";
import { MapView } from "../components/MapView";
import { EmptyState, ErrorState, LoadingState } from "../components/Layout";
import { BOROUGH_LABELS, STATUS_LABELS, formatAge } from "../lib/labels";

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

  const [snapshotUpdated, setSnapshotUpdated] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchPublicSnapshot(filters.borough);
      if (snap) {
        setSnapshotUpdated(snap.updatedLabel);
        const mapped = snap.features
          .filter((f) =>
            filters.statuses.includes(f.status as MapStatusFilter),
          )
          .filter((f) => !filters.category || f.category === filters.category)
          .map(
            (f): PublicIssueListItem => ({
              id: f.id,
              shortId: f.shortId,
              slug: f.slug,
              path: f.path,
              category: f.category,
              title: f.title,
              status: f.status,
              borough: f.borough,
              location: { longitude: f.longitude, latitude: f.latitude },
              supportCount: f.supportCount,
              createdAt: f.createdAt ?? new Date(0).toISOString(),
              resolvedAt: f.resolvedAt ?? null,
              daysToVerifiedFix: null,
              revision: f.revision,
            }),
          );
        setIssues(mapped);
        return;
      }
      setSnapshotUpdated(null);
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
      {snapshotUpdated ? (
        <p className="border-b border-border px-4 py-1 text-xs text-muted">
          {snapshotUpdated}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-panel p-3">
        {loading ? <LoadingState label="Loading reports…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error && issues.length > 0 ? (
          <div className="flex items-center justify-between px-1 pb-1 pt-0.5">
            <p className="text-sm font-bold">Recent reports</p>
            <Link to="/?view=list" className="text-xs font-semibold text-cobalt">
              See all →
            </Link>
          </div>
        ) : null}
        {!loading && !error && issues.length === 0 ? (
          <EmptyState
            title="No reports match"
            body="Try clearing a filter, or add the first report for this view."
            action={
              <Link
                to="/submit"
                className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
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
        <div className="border-t border-border bg-surface p-3">
          <p className="mb-1 text-xs font-semibold text-muted">
            {STATUS_LABELS[selected.status as MapStatusFilter] ?? selected.status}
          </p>
          <p className="mb-2 font-bold leading-tight tracking-tight">{selected.title}</p>
          <Link
            to={selected.path}
            className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          >
            Open report
          </Link>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative h-[calc(100dvh-4.25rem)] md:h-[calc(100dvh-4.5rem)]">
      {/* Desktop: cream sidebar left, map right (mock 01) */}
      <div className="hidden h-full md:flex">
        {view === "map" ? (
          <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-panel">
            {listPanel}
          </aside>
        ) : null}
        <div className="relative min-w-0 flex-1">
          {view === "map" ? (
            <>
              <MapView
                issues={issues}
                selectedId={selectedId}
                onSelect={selectReport}
              />
              <div className="absolute left-4 top-4 z-10">
                <span className="inline-flex min-h-10 items-center rounded-[8px] border border-border bg-surface px-3 text-sm font-semibold shadow-[0_8px_20px_rgba(23,33,29,0.1)]">
                  {filters.borough ? BOROUGH_LABELS[filters.borough] : "NYC"}
                </span>
              </div>
              <MapLegend />
            </>
          ) : (
            <div className="h-full overflow-y-auto bg-canvas p-4">{listPanel}</div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="flex h-full flex-col md:hidden">
        {view === "list" ? (
          <div className="min-h-0 flex-1 overflow-hidden">{listPanel}</div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-x-3 top-3 z-10 overflow-hidden rounded-xl border border-border shadow-[0_10px_28px_rgba(23,33,29,0.12)]">
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  view={view}
                  onViewChange={setView}
                  compact
                />
              </div>
              <MapView
                issues={issues}
                selectedId={selectedId}
                onSelect={selectReport}
              />
              <div className="absolute bottom-3 left-3">
                <MapLegend compact />
              </div>
            </div>
            <div
              className={`relative z-10 shrink-0 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-surface shadow-[0_-12px_32px_rgba(23,33,29,0.12)] transition-[height] ${
                sheetHeight === "collapsed"
                  ? "h-20"
                  : sheetHeight === "half"
                    ? "h-[48%]"
                    : "h-[85%]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
                <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong" />
                <p className="min-w-0 truncate pt-2 text-sm font-bold tracking-tight">
                  {selected
                    ? selected.title
                    : loading
                      ? "Loading…"
                      : `${issues.length} nearby report${issues.length === 1 ? "" : "s"}`}
                </p>
                <div className="flex shrink-0 gap-1 pt-2">
                  <button
                    type="button"
                    className="min-h-10 min-w-10 rounded-lg text-sm font-semibold text-muted hover:bg-border/40"
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
                      className="min-h-10 min-w-10 rounded-lg text-lg font-semibold text-muted hover:bg-border/40"
                      onClick={() => selectReport(undefined)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="h-[calc(100%-3.25rem)] space-y-3 overflow-y-auto p-3">
                {error ? (
                  <ErrorState message={error} onRetry={() => void load()} />
                ) : null}
                {selected ? (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      {selected.thumbnailUrl ? (
                        <img
                          src={selected.thumbnailUrl}
                          alt=""
                          className="h-20 w-20 shrink-0 rounded-[10px] object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] bg-panel text-xs text-muted">
                          No photo
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-open">
                          <span className="h-1.5 w-1.5 rounded-full bg-open" />
                          {STATUS_LABELS[selected.status as MapStatusFilter] ?? "Open"}
                        </p>
                        <h3 className="font-bold leading-snug">{selected.title}</h3>
                        <p className="text-sm text-muted">
                          {BOROUGH_LABELS[selected.borough]}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      {formatAge(selected.createdAt)} · {selected.supportCount} support
                      {selected.supportCount === 1 ? "" : "s"}
                    </p>
                    <Link
                      to={selected.path}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-cobalt font-semibold text-white hover:bg-[#1d4ed8]"
                    >
                      Follow this report
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

function MapLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        "rounded-xl border border-border bg-surface/95 px-3 py-2 text-xs font-semibold shadow-[0_8px_20px_rgba(23,33,29,0.1)]",
        compact ? "flex gap-2" : "absolute bottom-4 left-4 z-10 flex gap-4",
      ].join(" ")}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-open" />
        Open
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pending" />
        Possibly fixed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-fixed" />
        Fixed
      </span>
    </div>
  );
}
