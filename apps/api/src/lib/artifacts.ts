import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Public artifact store for snapshots and share cards.
 * Local/dev writes under a directory; production can swap to R2 via env.
 */
export interface ArtifactStore {
  put(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(objectKey: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  delete(objectKey: string): Promise<void>;
  /** Absolute or relative URL path for public GETs */
  publicUrl(objectKey: string): string;
}

const SAFE_KEY = /^(snapshots|share-cards)\/[a-zA-Z0-9._/-]+$/;

export function assertArtifactKey(objectKey: string): void {
  if (
    !SAFE_KEY.test(objectKey) ||
    objectKey.includes("..") ||
    objectKey.startsWith("/") ||
    objectKey.includes("\\")
  ) {
    throw new Error("Invalid artifact key.");
  }
}

export class FilesystemArtifactStore implements ArtifactStore {
  constructor(
    private readonly directory: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    assertArtifactKey(objectKey);
    const file = path.join(this.directory, objectKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    // contentType is stored beside the file for local serving
    await writeFile(`${file}.ctype`, contentType, "utf8");
  }

  async get(
    objectKey: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    assertArtifactKey(objectKey);
    try {
      const file = path.join(this.directory, objectKey);
      const bytes = new Uint8Array(await readFile(file));
      let contentType = "application/octet-stream";
      try {
        contentType = (await readFile(`${file}.ctype`, "utf8")).trim();
      } catch {
        if (objectKey.endsWith(".svg")) contentType = "image/svg+xml";
        if (objectKey.endsWith(".json")) contentType = "application/json";
      }
      return { bytes, contentType };
    } catch {
      return null;
    }
  }

  async delete(objectKey: string): Promise<void> {
    assertArtifactKey(objectKey);
    const file = path.join(this.directory, objectKey);
    await rm(file, { force: true });
    await rm(`${file}.ctype`, { force: true });
  }

  publicUrl(objectKey: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/artifacts/${objectKey}`;
  }
}

export class MemoryArtifactStore implements ArtifactStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  constructor(private readonly publicBaseUrl: string) {}

  async put(
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    assertArtifactKey(objectKey);
    this.objects.set(objectKey, { bytes, contentType });
  }

  async get(objectKey: string) {
    assertArtifactKey(objectKey);
    return this.objects.get(objectKey) ?? null;
  }

  async delete(objectKey: string): Promise<void> {
    assertArtifactKey(objectKey);
    this.objects.delete(objectKey);
  }

  publicUrl(objectKey: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/artifacts/${objectKey}`;
  }
}

export type CdnPurgeResult = {
  provider: "local" | "cloudflare";
  status: "recorded" | "submitted" | "skipped";
  detail: Record<string, unknown>;
};

/**
 * CDN purge interface. Local records paths; Cloudflare runs when credentials exist.
 */
export async function purgeCdnPaths(
  paths: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<CdnPurgeResult> {
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (
    !zoneId ||
    !token ||
    zoneId.startsWith("your-") ||
    token.startsWith("your-")
  ) {
    return {
      provider: "local",
      status: "recorded",
      detail: { paths, note: "No Cloudflare purge credentials; local purge log only." },
    };
  }
  // Production hook — do not call paid APIs from tests without credentials.
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ files: paths }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      provider: "cloudflare",
      status: response.ok ? "submitted" : "recorded",
      detail: { httpStatus: response.status, body, paths },
    };
  } catch (err) {
    return {
      provider: "cloudflare",
      status: "recorded",
      detail: {
        paths,
        error: err instanceof Error ? err.message : "purge failed",
      },
    };
  }
}

export function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function caseNumber(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}
