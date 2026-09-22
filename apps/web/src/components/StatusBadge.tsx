import type { PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { Link } from "react-router-dom";
import {
  BOROUGH_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  formatAge,
  isPublicMapStatus,
} from "../lib/labels";

export function StatusBadge({
  status,
}: {
  status: "open" | "fix_pending" | "resolved";
}) {
  const color =
    status === "open"
      ? "border-open/20 bg-open/10 text-open"
      : status === "fix_pending"
        ? "border-pending/25 bg-pending/10 text-pending"
        : "border-fixed/20 bg-fixed/10 text-fixed";
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${color}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "open" ? "bg-open" : status === "fix_pending" ? "bg-pending" : "bg-fixed"
        }`}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function IssueCard({
  issue,
  selected,
  onSelect,
  to,
}: {
  issue: PublicIssueListItem;
  selected?: boolean;
  onSelect?: () => void;
  to?: string;
}) {
  const status = isPublicMapStatus(issue.status) ? issue.status : "open";
  const content = (
    <>
      <div className="flex gap-3">
        {issue.thumbnailUrl ? (
          <img
            src={issue.thumbnailUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-[10px] border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[10px] border border-border bg-panel text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            No photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold leading-snug tracking-tight">
            {issue.title}
          </h3>
          <p className="truncate text-sm text-muted">
            {BOROUGH_LABELS[issue.borough]}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
            {CATEGORY_LABELS[issue.category]}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "open"
                    ? "bg-open"
                    : status === "fix_pending"
                      ? "bg-pending"
                      : "bg-fixed"
                }`}
              />
              {status === "resolved" ? "Fixed" : STATUS_LABELS[status]}{" "}
              {formatAge(issue.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  const className = [
    "block w-full rounded-xl border px-3 py-3 text-left mock-card-shadow transition-colors",
    selected
      ? "border-cobalt bg-cobalt/5"
      : "border-border bg-surface hover:border-border-strong",
  ].join(" ");

  if (to) {
    return (
      <Link to={to} className={className} aria-current={selected ? "true" : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={`${className} min-h-11`}>
      {content}
    </button>
  );
}
