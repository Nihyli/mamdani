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
const CATEGORY_FILTERS: IssueCategory[] = [
  "pothole",
  "overflowing_trash",
  "broken_streetlight",
  "damaged_sidewalk",
  "broken_park_equipment",
  "other",
];

const STATUS_DOT: Record<MapStatusFilter, string> = {
  open: "bg-open",
  fix_pending: "bg-pending",
  resolved: "bg-fixed",
};

const CATEGORY_CHIP: Record<IssueCategory, string> = {
  pothole: "bg-chip-pothole border-open/15 text-ink",
  overflowing_trash: "bg-chip-trash border-fixed/20 text-ink",
  broken_streetlight: "bg-chip-light border-pending/25 text-ink",
  damaged_sidewalk: "bg-chip-sidewalk border-cobalt/20 text-ink",
  broken_park_equipment: "bg-chip-park border-[#7c3aed]/20 text-ink",
  broken_fountain: "bg-chip-park border-[#7c3aed]/20 text-ink",
  other: "bg-chip-other border-border text-ink",
};

const CATEGORY_SHORT: Partial<Record<IssueCategory, string>> = {
  pothole: "Pothole",
  overflowing_trash: "Trash",
  broken_streetlight: "Streetlight",
  damaged_sidewalk: "Blocked sidewalk",
  broken_park_equipment: "Park equipment",
  other: "Other",
};

export function FilterBar({
  filters,
  onChange,
  view,
  onViewChange,
  compact,
}: {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  view: "map" | "list";
  onViewChange: (view: "map" | "list") => void;
  compact?: boolean;
}) {
  function toggleStatus(status: MapStatusFilter) {
    const has = filters.statuses.includes(status);
    const next = has
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next.length ? next : ["open"] });
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-surface/95 px-3 py-2.5 backdrop-blur-sm">
        <label className="sr-only" htmlFor="explore-search-compact">
          Search a neighborhood
        </label>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
            ⌕
          </span>
          <input
            id="explore-search-compact"
            type="search"
            className="min-h-10 w-full rounded-full border border-border bg-surface py-2 pl-8 pr-3 text-sm"
            placeholder="Search a neighborhood"
          />
        </div>
        <label className="sr-only" htmlFor="filter-borough-compact">
          Borough
        </label>
        <select
          id="filter-borough-compact"
          className="min-h-10 rounded-full border border-border bg-surface px-3 text-sm font-semibold"
          value={filters.borough ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              borough: (e.target.value || undefined) as NycBorough | undefined,
            })
          }
        >
          <option value="">NYC</option>
          {(Object.keys(BOROUGH_LABELS) as NycBorough[]).map((key) => (
            <option key={key} value={key}>
              {BOROUGH_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border bg-panel p-4">
      <div>
        <label className="sr-only" htmlFor="explore-search">
          Search a neighborhood
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
            ⌕
          </span>
          <input
            id="explore-search"
            type="search"
            className="min-h-11 w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-3 text-sm shadow-sm"
            placeholder="Search a neighborhood"
          />
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted">
          e.g. Astoria, Bushwick, Harlem…
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="filter-borough">
          Borough
        </label>
        <select
          id="filter-borough"
          className="min-h-10 rounded-[8px] border border-border bg-surface px-3 text-sm font-semibold text-ink"
          value={filters.borough ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              borough: (e.target.value || undefined) as NycBorough | undefined,
            })
          }
        >
          <option value="">NYC</option>
          {(Object.keys(BOROUGH_LABELS) as NycBorough[]).map((key) => (
            <option key={key} value={key}>
              {BOROUGH_LABELS[key]}
            </option>
          ))}
        </select>
        <div
          className="inline-flex rounded-[8px] border border-border bg-surface p-0.5"
          role="group"
          aria-label="Map or list"
        >
          <button
            type="button"
            className={`min-h-9 min-w-12 rounded-md px-2 text-xs font-bold ${
              view === "map" ? "bg-cobalt text-white" : "text-muted hover:bg-border/40"
            }`}
            onClick={() => onViewChange("map")}
            aria-pressed={view === "map"}
          >
            Map
          </button>
          <button
            type="button"
            className={`min-h-9 min-w-12 rounded-md px-2 text-xs font-bold ${
              view === "list" ? "bg-cobalt text-white" : "text-muted hover:bg-border/40"
            }`}
            onClick={() => onViewChange("list")}
            aria-pressed={view === "list"}
          >
            List
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">Report a problem</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Category filters">
          {CATEGORY_FILTERS.map((category) => {
            const on = filters.category === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...filters,
                    category: on ? undefined : category,
                  })
                }
                className={`inline-flex min-h-10 items-center justify-center rounded-[10px] border px-2 text-xs font-semibold ${
                  CATEGORY_CHIP[category]
                } ${on ? "ring-2 ring-cobalt ring-offset-1" : ""}`}
              >
                {CATEGORY_SHORT[category] ?? CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">Filter by status</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status filters">
          {ALL_STATUSES.map((status) => {
            const on = filters.statuses.includes(status);
            const label =
              status === "resolved" ? "Fixed" : STATUS_LABELS[status];
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(status)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold ${
                  on
                    ? "border-border-strong bg-surface text-ink shadow-sm"
                    : "border-border bg-surface text-muted hover:border-border-strong"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
