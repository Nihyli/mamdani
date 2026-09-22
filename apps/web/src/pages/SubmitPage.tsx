import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  issueCategorySchema,
  type IssueCategory,
} from "@mamdani-ticketer/contracts";
import {
  ApiClientError,
  completeUpload,
  createSubmission,
  duplicateSourcePath,
  sha256Hex,
  signUpload,
  uploadBytesWithProgress,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { autocompleteNyc, type GeocodeSuggestion } from "../lib/geocoder";
import { CATEGORY_LABELS } from "../lib/labels";
import { NYC_CENTER } from "../lib/map-style";
import { MapView } from "../components/MapView";
import { Page } from "../components/Layout";

type Step = 1 | 2 | 3;

const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

export function SubmitPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<IssueCategory>("pothole");
  const [title, setTitle] = useState("");
  const [locationText, setLocationText] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pin, setPin] = useState<{ longitude: number; latitude: number } | null>(
    null,
  );
  const [sourceUrl, setSourceUrl] = useState("");
  const [rightsAttested, setRightsAttested] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const runAutocomplete = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void autocompleteNyc(
        text,
        pin
          ? { latitude: pin.latitude, longitude: pin.longitude }
          : { latitude: NYC_CENTER[1], longitude: NYC_CENTER[0] },
        controller.signal,
      )
        .then((items) => {
          setSuggestions(items);
          setGeoError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setGeoError(
            err instanceof Error ? err.message : "Address lookup failed.",
          );
        });
    }, 300);
  }, [pin]);

  function onLocationInput(value: string) {
    setLocationText(value);
    runAutocomplete(value);
  }

  function pickSuggestion(item: GeocodeSuggestion) {
    setLocationText(item.label);
    setPin({ longitude: item.longitude, latitude: item.latitude });
    setSuggestions([]);
  }

  function onFileChange(next: File | null) {
    setFormError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!ALLOWED.has(next.type)) {
      setFormError("Use JPEG, PNG, WebP, or MP4.");
      return;
    }
    const max = next.type.startsWith("video/") ? MAX_VIDEO : MAX_PHOTO;
    if (next.size > max) {
      setFormError(
        next.type.startsWith("video/")
          ? "Video must be 50 MB or smaller."
          : "Photo must be 10 MB or smaller.",
      );
      return;
    }
    setFile(next);
  }

  const canStep1 = Boolean(file);
  const canStep2 = Boolean(locationText.trim() && pin);
  const canStep3 = rightsAttested && !submitting;

  const reviewLines = useMemo(
    () => [
      { label: "Media", value: file?.name ?? "—" },
      { label: "Category", value: CATEGORY_LABELS[category] },
      { label: "Title", value: title.trim() || "(generated at review)" },
      { label: "Location", value: locationText.trim() || "—" },
      {
        label: "Pin",
        value: pin
          ? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`
          : "—",
      },
      {
        label: "Where did you see this?",
        value: sourceUrl.trim() || "Not provided",
      },
    ],
    [file, category, title, locationText, pin, sourceUrl],
  );

  async function submit() {
    if (!auth.authHeaders) {
      navigate("/sign-in?next=/submit");
      return;
    }
    if (!file || !pin || !rightsAttested) return;

    setSubmitting(true);
    setFormError(null);
    setUploadProgress(0);

    try {
      const signed = await signUpload(
        {
          mimeType: file.type,
          byteSize: file.size,
          filename: file.name,
        },
        auth.authHeaders,
      );

      await uploadBytesWithProgress(
        signed.uploadUrl,
        file,
        signed.headers,
        (ratio) => setUploadProgress(ratio),
      );

      const digest = await sha256Hex(file);
      await completeUpload(signed.mediaId, auth.authHeaders, digest);

      const idempotencyKey =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const result = await createSubmission(
        {
          idempotencyKey,
          kind: "upload",
          category,
          ...(title.trim() ? { title: title.trim() } : {}),
          locationText: locationText.trim(),
          location: pin,
          locationPrecision: "user_supplied",
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          rightsAttested: true,
          mediaIds: [signed.mediaId],
        },
        auth.authHeaders,
      );

      navigate(`/my-reports/${result.id}`, {
        state: { processingState: result.processingState },
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          navigate("/sign-in?next=/submit");
          return;
        }
        const dup = duplicateSourcePath(err);
        if (dup) {
          navigate(dup);
          return;
        }
        if (err.status === 429) {
          setFormError(
            err.retryAfterSeconds
              ? `${err.message} Try again in about ${Math.ceil(err.retryAfterSeconds / 60)} minutes.`
              : err.message,
          );
          return;
        }
        setFormError(err.message);
        return;
      }
      setFormError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth.ready) {
    return (
      <Page title="Add a report">
        <p className="text-muted">Checking sign-in…</p>
      </Page>
    );
  }

  if (!auth.userId) {
    return (
      <Page title="Add a report">
        <p className="mb-4 text-muted">
          Sign in to upload evidence and submit a report for review.
        </p>
        <Link
          to="/sign-in?next=/submit"
          className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white"
        >
          Sign in to continue
        </Link>
      </Page>
    );
  }

  return (
    <Page title="Add a report" narrow>
      <ol className="mb-6 flex gap-2 text-sm" aria-label="Submission steps">
        {([1, 2, 3] as const).map((n) => (
          <li
            key={n}
            className={`rounded-md px-3 py-2 font-medium ${
              step === n ? "bg-cobalt text-white" : "bg-border/50 text-muted"
            }`}
          >
            {n === 1 ? "Media" : n === 2 ? "Location" : "Review"}
          </li>
        ))}
      </ol>

      {formError ? (
        <div role="alert" className="mb-4 rounded-md border border-open/40 bg-open/10 px-3 py-3 text-sm">
          {formError}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4">
          <div>
            <label htmlFor="media" className="mb-2 block font-medium">
              Photo or video (required)
            </label>
            <input
              id="media"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              className="block w-full min-h-11 text-sm"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-sm text-muted">
              Up to 10 MB photo or 50 MB / 60 s MP4. This is the evidence — a
              TikTok link alone is not enough.
            </p>
          </div>
          {previewUrl && file ? (
            file.type.startsWith("video/") ? (
              <video src={previewUrl} controls className="max-h-64 w-full rounded-md bg-ink" />
            ) : (
              <img src={previewUrl} alt="Selected upload preview" className="max-h-64 rounded-md object-contain" />
            )
          ) : null}

          <div>
            <label htmlFor="category" className="mb-2 block font-medium">
              Category
            </label>
            <select
              id="category"
              className="min-h-11 w-full rounded-md border border-border bg-white px-3"
              value={category}
              onChange={(e) => {
                const parsed = issueCategorySchema.safeParse(e.target.value);
                if (parsed.success) setCategory(parsed.data);
              }}
            >
              {issueCategorySchema.options.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="title" className="mb-2 block font-medium">
              Short title (optional)
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3"
              placeholder="e.g. Deep pothole on Broadway"
            />
          </div>

          <button
            type="button"
            disabled={!canStep1}
            onClick={() => setStep(2)}
            className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
          >
            Continue to location
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <div>
            <label htmlFor="location" className="mb-2 block font-medium">
              Intersection or address (required)
            </label>
            <input
              id="location"
              value={locationText}
              onChange={(e) => onLocationInput(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3"
              placeholder="120 Broadway, Manhattan"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted">
              Address suggestions from NYC Dept. of City Planning (GeoSearch).
            </p>
            {geoError ? <p className="mt-1 text-sm text-open">{geoError}</p> : null}
            {suggestions.length > 0 ? (
              <ul className="mt-2 overflow-hidden rounded-md border border-border bg-white">
                {suggestions.map((item) => (
                  <li key={`${item.label}-${item.longitude}-${item.latitude}`}>
                    <button
                      type="button"
                      className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-border/40"
                      onClick={() => pickSuggestion(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="mb-2 font-medium">Confirm the pin</p>
            <p className="mb-2 text-sm text-muted">
              Tap the map or drag the pin. Device location is only a convenience —
              you confirm the pin.
            </p>
            <div className="h-64 overflow-hidden rounded-md border border-border">
              <MapView
                issues={[]}
                onSelect={() => undefined}
                interactivePin={
                  pin ?? {
                    longitude: NYC_CENTER[0],
                    latitude: NYC_CENTER[1],
                  }
                }
                onPinMove={(longitude, latitude) => {
                  setPin({ longitude, latitude });
                  if (!locationText.trim()) {
                    setLocationText(
                      `Pin ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
                    );
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-cobalt"
              onClick={() => {
                if (!navigator.geolocation) {
                  setFormError("Geolocation is not available in this browser.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setPin({
                      longitude: pos.coords.longitude,
                      latitude: pos.coords.latitude,
                    });
                  },
                  () => setFormError("Could not read your location."),
                  { enableHighAccuracy: true, timeout: 10_000 },
                );
              }}
            >
              Use my location to center
            </button>
          </div>

          <div>
            <label htmlFor="source" className="mb-2 block font-medium">
              Where did you see this? (optional)
            </label>
            <input
              id="source"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3"
              placeholder="https://www.tiktok.com/…"
            />
            <p className="mt-1 text-sm text-muted">
              Attribution and duplicate check only — we do not download TikTok
              media.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canStep2}
              onClick={() => setStep(3)}
              className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
            >
              Continue to review
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <dl className="space-y-3 rounded-md border border-border bg-white p-4">
            {reviewLines.map((row) => (
              <div key={row.label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {row.label}
                </dt>
                <dd className="mt-0.5">{row.value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-muted">
            If approved, the report&apos;s location, selected evidence, source
            links and display name will be public.
          </p>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={rightsAttested}
              onChange={(e) => setRightsAttested(e.target.checked)}
            />
            <span>
              I own this material or have the rights needed to submit it under
              the{" "}
              <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
                Terms
              </Link>
              .
            </span>
          </label>

          {uploadProgress != null ? (
            <div>
              <p className="mb-1 text-sm font-medium">
                Upload progress: {Math.round(uploadProgress * 100)}%
              </p>
              <div className="h-2 overflow-hidden rounded bg-border">
                <div
                  className="h-full bg-cobalt transition-[width]"
                  style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={submitting}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canStep3}
              onClick={() => void submit()}
              className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </section>
      ) : null}
    </Page>
  );
}
