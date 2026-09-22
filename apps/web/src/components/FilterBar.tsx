import type { IssueCategory, NycBorough } from "@mamdani-ticketer/contracts";
import { BOROUGH_LABELS, CATEGORY_LABELS, STATUS_LABELS } from "../lib/labels";

export type MapStatusFilter = "open" | "fix_pending" | "resolved";

export type MapFilters = {
  category?: IssueCategory;
  borough?: NycBorough;
  /** Empty = none; default open+fix_pending */
  statuses: MapStatusFilter[];
};

const ALL_STATUSES: MapStatusFilter[] = ["open", "fix_pending", "resolved"];

export function FilterBar({
  filters,
  onChange,
  view,
  onViewChange,
}: {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  view: "map" | "list";
  onViewChange: (view: "map" | "list") => void;
}) {
  function toggleStatus(status: MapStatusFilter) {
    const has = filters.statuses.includes(status);
    const next = has
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next.length ? next : ["open"] });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filter-category">
          Category
        </label>
        <select
          id="filter-category"
          className="min-h-11 rounded-md border border-border bg-white px-3 text-sm"
          value={filters.category ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              category: (e.target.value || undefined) as IssueCategory | undefined,
            })
          }
        >
          <option value="">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-borough">
          Borough
        </label>
        <select
          id="filter-borough"
          className="min-h-11 rounded-md border border-border bg-white px-3 text-sm"
          value={filters.borough ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              borough: (e.target.value || undefined) as NycBorough | undefined,
            })
          }
        >
          <option value="">All boroughs</option>
          {(Object.keys(BOROUGH_LABELS) as NycBorough[]).map((key) => (
            <option key={key} value={key}>
              {BOROUGH_LABELS[key]}
            </option>
          ))}
        </select>

        <div
          className="ml-auto inline-flex rounded-md border border-border bg-white p-0.5"
          role="group"
          aria-label="Map or list"
        >
          <button
            type="button"
            className={`min-h-10 min-w-14 rounded px-3 text-sm font-medium ${
              view === "map" ? "bg-cobalt text-white" : "text-muted"
            }`}
            onClick={() => onViewChange("map")}
            aria-pressed={view === "map"}
          >
            Map
          </button>
          <button
            type="button"
            className={`min-h-10 min-w-14 rounded px-3 text-sm font-medium ${
              view === "list" ? "bg-cobalt text-white" : "text-muted"
            }`}
            onClick={() => onViewChange("list")}
            aria-pressed={view === "list"}
          >
            List
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Status filters">
        {ALL_STATUSES.map((status) => {
          const on = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(status)}
              className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium ${
                on
                  ? "border-cobalt bg-cobalt/10 text-ink"
                  : "border-border bg-white text-muted"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
