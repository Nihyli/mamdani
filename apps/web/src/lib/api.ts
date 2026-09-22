import {
  apiErrorSchema,
  type ApiError,
  type CreateSubmissionRequest,
  type CreateSubmissionResponse,
  type PublicIssue,
  type PublicIssueListItem,
  type PublicIssueListResponse,
  type SubmissionStatusResponse,
  type UploadCompleteResponse,
  type UploadSignRequest,
  type UploadSignResponse,
  createSubmissionRequestSchema,
  createSubmissionResponseSchema,
  publicIssueListResponseSchema,
  publicIssueSchema,
  submissionStatusResponseSchema,
  uploadCompleteResponseSchema,
  uploadSignRequestSchema,
  uploadSignResponseSchema,
} from "@mamdani-ticketer/contracts";

export const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:8787";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiError["code"];
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.retryAfterSeconds = error.retryAfterSeconds;
  }
}

export type AuthHeaders = {
  authorization?: string;
  devUserId?: string;
};

function buildHeaders(
  auth: AuthHeaders | undefined,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (auth?.authorization) {
    headers.set("Authorization", auth.authorization);
  }
  if (auth?.devUserId) {
    headers.set("x-dev-user-id", auth.devUserId);
  }
  return headers;
}

async function parseError(res: Response): Promise<ApiClientError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiClientError(res.status, {
      code: "internal_error",
      message: res.statusText || "Request failed.",
    });
  }
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiClientError(res.status, parsed.data);
  }
  return new ApiClientError(res.status, {
    code: "internal_error",
    message:
      typeof body === "object" &&
      body &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Request failed.",
  });
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    auth?: AuthHeaders;
    body?: unknown;
    schema: { parse: (data: unknown) => T };
    query?: Record<string, string | number | undefined | null>;
  },
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const headers = buildHeaders(options.auth, {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
  });
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  const json: unknown = await res.json();
  return options.schema.parse(json);
}

export async function listPublicIssues(query: {
  cursor?: string;
  limit?: number;
  category?: string;
  borough?: string;
  status?: string;
}): Promise<PublicIssueListResponse> {
  return requestJson("/api/public/issues", {
    schema: publicIssueListResponseSchema,
    query,
  });
}

/** Paginate until exhausted or cap — M1 volumes are small. */
export async function listAllPublicIssues(filters: {
  category?: string;
  borough?: string;
  status?: string;
  maxPages?: number;
}): Promise<PublicIssueListItem[]> {
  const items: PublicIssueListItem[] = [];
  let cursor: string | undefined;
  const maxPages = filters.maxPages ?? 20;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await listPublicIssues({
      cursor,
      limit: 50,
      category: filters.category,
      borough: filters.borough,
      status: filters.status,
    });
    items.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return items;
}

export async function getPublicIssue(id: string): Promise<PublicIssue> {
  return requestJson(`/api/public/issues/${id}`, {
    schema: publicIssueSchema,
  });
}

export async function findPublicIssueByPath(
  path: string,
): Promise<PublicIssue | null> {
  const normalized = path.startsWith("/") ? path : `/r/${path}`;
  const items = await listAllPublicIssues({});
  const match = items.find((item) => item.path === normalized);
  if (!match) return null;
  return getPublicIssue(match.id);
}

export async function signUpload(
  body: UploadSignRequest,
  auth: AuthHeaders,
): Promise<UploadSignResponse> {
  const validated = uploadSignRequestSchema.parse(body);
  return requestJson("/api/uploads/sign", {
    method: "POST",
    auth,
    body: validated,
    schema: uploadSignResponseSchema,
  });
}

export async function completeUpload(
  mediaId: string,
  auth: AuthHeaders,
  contentDigest?: string,
): Promise<UploadCompleteResponse> {
  return requestJson(`/api/uploads/${mediaId}/complete`, {
    method: "POST",
    auth,
    body: contentDigest ? { contentDigest } : {},
    schema: uploadCompleteResponseSchema,
  });
}

export async function createSubmission(
  body: CreateSubmissionRequest,
  auth: AuthHeaders,
): Promise<CreateSubmissionResponse> {
  const validated = createSubmissionRequestSchema.parse(body);
  return requestJson("/api/submissions", {
    method: "POST",
    auth,
    body: validated,
    schema: createSubmissionResponseSchema,
  });
}

export async function getSubmission(
  id: string,
  auth: AuthHeaders,
): Promise<SubmissionStatusResponse> {
  return requestJson(`/api/submissions/${id}`, {
    auth,
    schema: submissionStatusResponseSchema,
  });
}

export function uploadBytesWithProgress(
  uploadUrl: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    if (!headers["Content-Type"] && !headers["content-type"] && file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error."));
    xhr.send(file);
  });
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function duplicateSourcePath(
  error: ApiClientError,
): string | undefined {
  if (error.code !== "duplicate_source") return undefined;
  const path = error.details?.path;
  return typeof path === "string" ? path : undefined;
}
