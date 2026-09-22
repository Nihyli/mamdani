import type {
  IssueCategory,
  IssueStatus,
  NycBorough,
  ProcessingState,
} from "@mamdani-ticketer/contracts";

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  pothole: "Pothole",
  damaged_sidewalk: "Damaged sidewalk",
  broken_park_equipment: "Broken park equipment",
  broken_fountain: "Broken fountain",
  overflowing_trash: "Overflowing trash",
  broken_streetlight: "Broken streetlight",
  other: "Other public-space issue",
};

export const BOROUGH_LABELS: Record<NycBorough, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "Bronx",
  staten_island: "Staten Island",
};

/** Public map statuses with text labels (never color alone). */
export const STATUS_LABELS: Record<
  "open" | "fix_pending" | "resolved",
  string
> = {
  open: "Open",
  fix_pending: "Possibly fixed",
  resolved: "Verified fixed",
};

export const PROCESSING_LABELS: Record<ProcessingState, string> = {
  draft: "Draft",
  queued: "Uploaded",
  processing: "Uploaded",
  needs_input: "Needs more info",
  pending_review: "Pending review",
  accepted: "Published",
  rejected: "Not published",
};

export function formatAge(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

export function daysToVerifiedFixLabel(days: number | null | undefined): string {
  if (days == null) return "Time to verified fix unavailable";
  if (days === 0) return "Verified fixed same day as report";
  if (days === 1) return "1 day from report to verified fix";
  return `${days} days from report to verified fix`;
}

export function isPublicMapStatus(
  status: IssueStatus,
): status is "open" | "fix_pending" | "resolved" {
  return status === "open" || status === "fix_pending" || status === "resolved";
}
