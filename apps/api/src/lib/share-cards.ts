/**
 * SVG share-card renderers (SPEC §17).
 * 1200×630 OG and 1080×1920 story — factual fields only, subtle unofficial branding.
 */

export type ShareCardIssue = {
  title: string;
  borough: string;
  statusLabel: string;
  dateLabel: string;
  path: string;
  brandName: string;
  disclaimer: string;
  /** When resolved with before/after context */
  beforeLabel?: string | null;
  afterLabel?: string | null;
  intervalLabel?: string | null;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTitle(title: string, max = 48): string {
  const clean = title.trim() || "NYC report";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function renderOgCardSvg(issue: ShareCardIssue): string {
  const title = esc(wrapTitle(issue.title, 56));
  const meta = esc(
    `${issue.borough} · ${issue.statusLabel} · ${issue.dateLabel}`,
  );
  const brand = esc(issue.brandName);
  const path = esc(issue.path);
  const disclaimer = esc(issue.disclaimer);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">
  <rect width="1200" height="630" fill="#F7F5EF"/>
  <rect x="0" y="0" width="18" height="630" fill="#1F4B99"/>
  <text x="64" y="88" font-family="Georgia, serif" font-size="28" fill="#1F4B99">${brand}</text>
  <text x="64" y="200" font-family="Georgia, serif" font-size="54" fill="#1A1A1A">${title}</text>
  <text x="64" y="270" font-family="system-ui, sans-serif" font-size="28" fill="#444">${meta}</text>
  <text x="64" y="540" font-family="system-ui, sans-serif" font-size="22" fill="#1F4B99">${path}</text>
  <text x="64" y="590" font-family="system-ui, sans-serif" font-size="16" fill="#666">${disclaimer}</text>
</svg>`;
}

export function renderStoryCardSvg(issue: ShareCardIssue): string {
  const title = esc(wrapTitle(issue.title, 40));
  const brand = esc(issue.brandName);
  const path = esc(issue.path);
  const disclaimer = esc(issue.disclaimer);
  const left = esc(issue.beforeLabel ?? issue.statusLabel);
  const right = esc(issue.afterLabel ?? issue.dateLabel);
  const interval = esc(issue.intervalLabel ?? `${issue.borough} · ${issue.dateLabel}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img">
  <rect width="1080" height="1920" fill="#F7F5EF"/>
  <rect x="0" y="0" width="1080" height="24" fill="#1F4B99"/>
  <text x="64" y="120" font-family="Georgia, serif" font-size="36" fill="#1F4B99">${brand}</text>
  <text x="64" y="220" font-family="Georgia, serif" font-size="56" fill="#1A1A1A">${title}</text>
  <rect x="64" y="320" width="440" height="720" rx="8" fill="#E8E4DA"/>
  <text x="96" y="390" font-family="system-ui, sans-serif" font-size="28" fill="#444">Before</text>
  <text x="96" y="460" font-family="system-ui, sans-serif" font-size="32" fill="#1A1A1A">${left}</text>
  <rect x="576" y="320" width="440" height="720" rx="8" fill="#D7E4F7"/>
  <text x="608" y="390" font-family="system-ui, sans-serif" font-size="28" fill="#444">After</text>
  <text x="608" y="460" font-family="system-ui, sans-serif" font-size="32" fill="#1A1A1A">${right}</text>
  <text x="64" y="1160" font-family="system-ui, sans-serif" font-size="34" fill="#1A1A1A">${interval}</text>
  <text x="64" y="1720" font-family="system-ui, sans-serif" font-size="28" fill="#1F4B99">${path}</text>
  <text x="64" y="1800" font-family="system-ui, sans-serif" font-size="22" fill="#666">${disclaimer}</text>
</svg>`;
}
