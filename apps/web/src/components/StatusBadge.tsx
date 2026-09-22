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
      ? "bg-open/15 text-open"
      : status === "fix_pending"
        ? "bg-pending/15 text-pending"
        : "bg-fixed/15 text-fixed";
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold ${color}`}
    >
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function StatusDot({
  status,
}: {
  status: "open" | "fix_pending" | "resolved";
}) {
  const fill =
    status === "open" ? "#C94C3D" : status === "fix_pending" ? "#C4891A" : "#2F7A4A";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {status === "resolved" ? (
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.5"
          fill="none"
          stroke={fill}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : status === "fix_pending" ? (
        <>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke={fill} strokeWidth="1.5" />
          <path d="M6 3.5v3l2 1.2" fill="none" stroke={fill} strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : (
        <circle cx="6" cy="6" r="3.5" fill={fill} />
      )}
    </svg>
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
            className="h-16 w-16 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-border/60 text-xs text-muted">
            No photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-xs text-muted">{formatAge(issue.createdAt)}</span>
          </div>
          <h3 className="truncate font-semibold leading-snug">{issue.title}</h3>
          <p className="truncate text-sm text-muted">
            {CATEGORY_LABELS[issue.category]} · {BOROUGH_LABELS[issue.borough]}
          </p>
        </div>
      </div>
    </>
  );

  const className = [
    "block w-full border-b border-border px-3 py-3 text-left transition-colors",
    selected ? "bg-cobalt/10" : "hover:bg-border/40",
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
