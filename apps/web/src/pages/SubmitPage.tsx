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

const STEP_META = [
  { n: 1 as const, label: "Source" },
  { n: 2 as const, label: "Location" },
  { n: 3 as const, label: "Review" },
];

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
  const [submitted, setSubmitted] = useState(false);
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

  const canStep1 = Boolean(file || sourceUrl.trim());
  const canStep2 = Boolean(locationText.trim() && pin);
  const canStep3 = rightsAttested && !submitting && Boolean(file && pin);

  const reviewLines = useMemo(
    () => [
      { label: "Media", value: file?.name ?? "—" },
      { label: "Category", value: CATEGORY_LABELS[category] },
      { label: "Title", value: title.trim() || "(generated at review)" },
      { label: "Location", value: locationText.trim() || "—" },
      {
        label: "Where did you see this?",
        value: sourceUrl.trim() || "Not provided",
      },
    ],
    [file, category, title, locationText, sourceUrl],
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

      setSubmitted(true);
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
          className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 font-semibold text-white"
        >
          Sign in to continue
        </Link>
      </Page>
    );
  }

  const titles =
    step === 1
      ? {
          title: "Put it on the map",
          subtitle: "Share a link or upload a photo or video of the issue you want to report.",
        }
      : step === 2
        ? {
            title: "Review the location",
            subtitle: "Drag the pin to the correct spot. Location needs your confirmation.",
          }
        : {
            title: "Ready for review",
            subtitle: submitted
              ? "Your report has been submitted and is in the queue for moderator review."
              : "Confirm the details, then submit for moderator review.",
          };

  return (
    <Page narrow>
      <Stepper step={step} />

      <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{titles.title}</h1>
      <p className="mt-2 text-muted">{titles.subtitle}</p>

      {formError ? (
        <div role="alert" className="mt-4 rounded-xl border border-open/40 bg-open/10 px-3 py-3 text-sm">
          {formError}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="mt-5 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <label htmlFor="source" className="mb-2 block text-sm font-semibold">
              Paste a TikTok link
            </label>
            <input
              id="source"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3"
              placeholder="https://www.tiktok.com/…"
            />
            <p className="mt-1 text-xs text-muted">
              Optional attribution — we do not download TikTok media.
            </p>

            <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <label
              htmlFor="media"
              className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-panel px-4 py-6 text-center"
            >
              <p className="font-semibold">Upload a photo or video</p>
              <p className="mt-1 text-xs text-muted">JPG, PNG, MP4 · up to 50 MB video / 10 MB photo</p>
              <span className="mt-3 inline-flex min-h-10 items-center rounded-[8px] border border-border bg-surface px-4 text-sm font-semibold">
                Choose files
              </span>
              <input
                id="media"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                className="sr-only"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
            {previewUrl && file ? (
              file.type.startsWith("video/") ? (
                <video src={previewUrl} controls className="mt-3 max-h-56 w-full rounded-xl border border-border bg-ink" />
              ) : (
                <img src={previewUrl} alt="Selected upload preview" className="mt-3 max-h-56 rounded-xl border border-border object-contain" />
              )
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <label htmlFor="category" className="mb-2 block text-sm font-semibold">
              Category
            </label>
            <select
              id="category"
              className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3"
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
            <label htmlFor="title" className="mb-2 mt-4 block text-sm font-semibold">
              Short title (optional)
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3"
              placeholder="e.g. Deep pothole on Broadway"
            />
            <label htmlFor="intersection" className="mb-2 mt-4 block text-sm font-semibold">
              Optional: Intersection (helps us find it faster)
            </label>
            <input
              id="intersection"
              value={locationText}
              onChange={(e) => onLocationInput(e.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3"
              placeholder="e.g. Atlantic Ave & Flatbush Ave"
              autoComplete="off"
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cobalt"
              checked={rightsAttested}
              onChange={(e) => setRightsAttested(e.target.checked)}
            />
            <span>
              I confirm I have the right to share this content and it does not violate
              others&apos; privacy.{" "}
              <Link to="/terms" className="font-semibold text-cobalt underline-offset-2 hover:underline">
                Learn more
              </Link>
            </span>
          </label>

          <button
            type="button"
            disabled={!canStep1 || !file}
            onClick={() => setStep(2)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
          >
            Continue →
          </button>
          {!file ? (
            <p className="text-center text-xs text-muted">
              A photo or video upload is required to continue.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-5 space-y-4">
          <div className="relative h-72 overflow-hidden rounded-xl border border-border mock-card-shadow">
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
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-[8px] border border-ink bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm">
              Drag to adjust location
            </div>
          </div>

          <div>
            <label htmlFor="location" className="mb-2 block text-sm font-semibold">
              Intersection or address
            </label>
            <input
              id="location"
              value={locationText}
              onChange={(e) => onLocationInput(e.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3"
              placeholder="120 Broadway, Manhattan"
              autoComplete="off"
            />
            {geoError ? <p className="mt-1 text-sm text-open">{geoError}</p> : null}
            {suggestions.length > 0 ? (
              <ul className="mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
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

          {previewUrl ? (
            <div>
              <p className="mb-2 text-sm font-bold">Evidence from your upload</p>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {file?.type.startsWith("video/") ? (
                  <video src={previewUrl} className="h-24 w-full object-cover" muted />
                ) : (
                  <img src={previewUrl} alt="" className="h-24 w-full object-cover" />
                )}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canStep2}
            onClick={() => setStep(3)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
          >
            Correct location
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[8px] border border-border bg-surface px-4 font-semibold"
          >
            Back
          </button>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-5 space-y-4">
          <div className="flex gap-3 rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-16 w-16 rounded-[8px] object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-[8px] bg-panel text-xs text-muted">
                Media
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted">{CATEGORY_LABELS[category]}</p>
              <p className="font-bold leading-snug">
                {title.trim() || file?.name || "New report"}
              </p>
              <p className="mt-1 text-sm text-muted">{locationText.trim() || "—"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <p className="mb-3 text-sm font-bold">What happens next?</p>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cobalt text-xs font-bold text-white">
                  ✓
                </span>
                Upload received
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cobalt text-xs font-bold text-white">
                  ✓
                </span>
                Issue identified
              </li>
              <li className="flex items-center gap-3 text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-panel text-xs font-bold">
                  3
                </span>
                Moderator review pending
              </li>
            </ol>
          </div>

          <div className="flex gap-3 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-3 text-sm">
            <span aria-hidden="true">🔔</span>
            <p>
              We will notify you when it is published. You can also check the status in
              your reports anytime.
            </p>
          </div>

          <dl className="space-y-2 rounded-xl border border-border bg-panel p-4 text-sm">
            {reviewLines.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-muted">{row.label}</dt>
                <dd className="text-right font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>

          {!rightsAttested ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-panel p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-cobalt"
                checked={rightsAttested}
                onChange={(e) => setRightsAttested(e.target.checked)}
              />
              <span>
                I own this material or have the rights needed to submit it under the{" "}
                <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
                  Terms
                </Link>
                .
              </span>
            </label>
          ) : null}

          {uploadProgress != null ? (
            <div>
              <p className="mb-1 text-sm font-medium">
                Upload progress: {Math.round(uploadProgress * 100)}%
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-cobalt transition-[width]"
                  style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canStep3}
            onClick={() => void submit()}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-cobalt"
          >
            Back
          </button>
        </section>
      ) : null}
    </Page>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center justify-between gap-2" aria-label="Submission steps">
      {STEP_META.map((item, idx) => {
        const done = step > item.n;
        const active = step === item.n;
        return (
          <li key={item.n} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done || active
                    ? "bg-cobalt text-white"
                    : "bg-border text-muted"
                }`}
              >
                {done ? "✓" : item.n}
              </span>
              <span
                className={`truncate text-sm font-semibold ${
                  active || done ? "text-ink" : "text-muted"
                }`}
              >
                {item.label}
              </span>
            </div>
            {idx < STEP_META.length - 1 ? (
              <span className="hidden h-px min-w-4 flex-1 bg-border sm:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
