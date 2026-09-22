import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type SignedUpload = {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
};

export interface ObjectStore {
  signUpload(objectKey: string, mimeType: string): Promise<SignedUpload>;
  put(objectKey: string, bytes: Uint8Array): Promise<void>;
  get(objectKey: string): Promise<StoredObject | null>;
  size(objectKey: string): Promise<number | null>;
}

/** User upload keys only (signed PUT). */
const KEY_PATTERN = /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
/** Local fixture keys seeded onto disk for /dev-uploads GETs. */
const FIXTURE_KEY_PATTERN = /^fixtures\/[a-zA-Z0-9._-]+$/;

export function assertObjectKey(objectKey: string): void {
  if (!KEY_PATTERN.test(objectKey) || objectKey.includes("..")) {
    throw new Error("Invalid object key.");
  }
}

/** Keys safe to read back via local /dev-uploads (uploads + seeded fixtures). */
export function assertReadableObjectKey(objectKey: string): void {
  if (
    objectKey.includes("..") ||
    objectKey.startsWith("/") ||
    objectKey.includes("\\")
  ) {
    throw new Error("Invalid object key.");
  }
  if (!KEY_PATTERN.test(objectKey) && !FIXTURE_KEY_PATTERN.test(objectKey)) {
    throw new Error("Invalid object key.");
  }
}

function contentTypeForKey(objectKey: string): string {
  const ext = path.extname(objectKey).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Uint8Array>();

  constructor(private readonly baseUrl: string) {}

  async signUpload(objectKey: string, mimeType: string): Promise<SignedUpload> {
    assertObjectKey(objectKey);
    return {
      uploadUrl: `${this.baseUrl}/${objectKey}`,
      headers: { "content-type": mimeType },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async put(objectKey: string, bytes: Uint8Array): Promise<void> {
    assertObjectKey(objectKey);
    this.objects.set(objectKey, bytes);
  }

  async get(objectKey: string): Promise<StoredObject | null> {
    assertReadableObjectKey(objectKey);
    const bytes = this.objects.get(objectKey);
    if (!bytes) return null;
    return { bytes, contentType: contentTypeForKey(objectKey) };
  }

  async size(objectKey: string): Promise<number | null> {
    assertObjectKey(objectKey);
    const bytes = this.objects.get(objectKey);
    return bytes ? bytes.byteLength : null;
  }
}

export class FilesystemObjectStore implements ObjectStore {
  constructor(
    private readonly directory: string,
    private readonly baseUrl: string,
  ) {}

  async signUpload(objectKey: string, mimeType: string): Promise<SignedUpload> {
    assertObjectKey(objectKey);
    return {
      uploadUrl: `${this.baseUrl}/${objectKey}`,
      headers: { "content-type": mimeType },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async put(objectKey: string, bytes: Uint8Array): Promise<void> {
    assertObjectKey(objectKey);
    const file = this.filePath(objectKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  async get(objectKey: string): Promise<StoredObject | null> {
    assertReadableObjectKey(objectKey);
    try {
      const bytes = new Uint8Array(await readFile(this.filePath(objectKey)));
      return { bytes, contentType: contentTypeForKey(objectKey) };
    } catch {
      return null;
    }
  }

  async size(objectKey: string): Promise<number | null> {
    assertObjectKey(objectKey);
    try {
      const info = await stat(this.filePath(objectKey));
      return info.size;
    } catch {
      return null;
    }
  }

  private filePath(objectKey: string): string {
    return path.join(this.directory, objectKey);
  }
}
