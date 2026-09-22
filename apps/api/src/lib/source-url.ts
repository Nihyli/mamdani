export type CanonicalSource = {
  platform: "tiktok";
  platformPostId: string;
  canonicalUrl: string;
};

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

/**
 * Canonicalize a TikTok URL for attribution and dedup.
 * Does not fetch the URL. Rejects non-TikTok hosts and internal addresses.
 */
export function canonicalizeTikTokUrl(raw: string): CanonicalSource {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Source URL is not a valid URL.");
  }

  if (url.username || url.password) {
    throw new Error("Source URL must not include credentials.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Source URL must use https.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedHost(host)) {
    throw new Error("Source URL host is not allowed.");
  }
  if (!TIKTOK_HOSTS.has(host)) {
    throw new Error("Only TikTok links can be attached. Upload the photo or video you have rights to.");
  }

  const video = url.pathname.match(/\/video\/(\d+)/);
  const short = url.pathname.match(/^\/(?:t|v)\/([A-Za-z0-9]+)/);
  const platformPostId = video?.[1] ?? short?.[1];
  if (!platformPostId) {
    throw new Error("Could not read a TikTok video id from that link.");
  }

  const canonicalUrl = video
    ? `https://www.tiktok.com/video/${platformPostId}`
    : `https://www.tiktok.com/t/${platformPostId}`;

  return { platform: "tiktok", platformPostId, canonicalUrl };
}

function isBlockedHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "0.0.0.0" || host === "169.254.169.254" || host === "metadata.google.internal") {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

const SLUG_STOP = new Set(["the", "a", "an", "of", "and", "on", "in", "at"]);

export function slugFromTitle(title: string): string {
  const parts = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter((part) => part.length > 0 && !SLUG_STOP.has(part));
  const slug = parts.join("-").slice(0, 60).replace(/-$/, "");
  return slug.length > 0 ? slug : "report";
}

export function createShortId(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const splitAt = raw.lastIndexOf("|");
    if (splitAt <= 0) return null;
    const createdAt = raw.slice(0, splitAt);
    const id = raw.slice(splitAt + 1);
    if (Number.isNaN(Date.parse(createdAt))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
