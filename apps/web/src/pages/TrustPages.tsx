import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ContentReportCategory } from "@mamdani-ticketer/contracts";
import { ApiClientError, API_BASE } from "../lib/api";
import { Page } from "../components/Layout";

const CATEGORIES: {
  value: ContentReportCategory;
  label: string;
  icon: string;
}[] = [
  { value: "privacy_exposure", label: "Privacy concern", icon: "🛡" },
  { value: "ncii", label: "Intimate imagery", icon: "👁‍🗨" },
  { value: "threat_safety", label: "Other safety concern", icon: "!" },
  { value: "wrong_location", label: "Wrong location / false report", icon: "📍" },
  { value: "other", label: "Other", icon: "…" },
];

export function ReportContentPage() {
  const [params] = useSearchParams();
  const statusCase = params.get("case");
  const statusToken = params.get("token");
  const isStatusView = Boolean(statusCase && statusToken);

  if (isStatusView && statusCase && statusToken) {
    return <ReportStatusView caseNumber={statusCase} token={statusToken} />;
  }

  return <ReportIntakeForm initialPageUrl={params.get("url") ?? undefined} />;
}

function ReportIntakeForm({ initialPageUrl }: { initialPageUrl?: string }) {
  const [category, setCategory] = useState<ContentReportCategory>("privacy_exposure");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState(initialPageUrl ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    caseNumber: string;
    statusPath: string;
    isUrgent: boolean;
    urgentDeadlineAt: string | null;
  } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/content-reports`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          category,
          description,
          ...(pageUrl ? { pageUrl } : {}),
          ...(contactEmail ? { contactEmail } : {}),
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new ApiClientError(res.status, {
          code: (body.code as "validation_failed") ?? "internal_error",
          message: String(body.message ?? "Could not submit report."),
        });
      }
      setResult({
        caseNumber: String(body.caseNumber),
        statusPath: String(body.statusPath),
        isUrgent: Boolean(body.isUrgent),
        urgentDeadlineAt: (body.urgentDeadlineAt as string | null) ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Page title="Report received" narrow>
        <p className="mb-3 text-sm text-ink">
          Case number: <strong className="font-mono">{result.caseNumber}</strong>
        </p>
        {result.isUrgent ? (
          <p className="mb-3 rounded-[8px] border border-orange/40 bg-orange/10 px-3 py-2 text-sm text-ink">
            This was flagged as urgent. Target review window ends{" "}
            {result.urgentDeadlineAt
              ? new Date(result.urgentDeadlineAt).toLocaleString()
              : "within 48 hours"}
            . This is not an emergency service — call 911 for immediate danger.
          </p>
        ) : null}
        <p className="mb-4 text-sm text-muted">
          Save your private status link. No account is required.
        </p>
        <Link
          to={result.statusPath}
          className="inline-flex min-h-11 items-center text-cobalt underline-offset-2 hover:underline"
        >
          Check status
        </Link>
      </Page>
    );
  }

  return (
    <Page title="Report harmful content" narrow>
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#ecfdf5] to-[#dbeafe] p-5">
        <p className="font-display text-xl font-bold">Good Neighbors Stronger NYC</p>
      </div>
      <p className="mb-4 text-sm text-muted">
        What best describes the issue? No account required. Provide the page link;
        do not upload another copy of intimate imagery.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">What best describes the issue?</legend>
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                category === c.value
                  ? "border-cobalt bg-cobalt/5"
                  : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="category"
                className="accent-cobalt"
                checked={category === c.value}
                onChange={() => setCategory(c.value)}
              />
              <span className="text-cobalt" aria-hidden="true">
                {c.icon}
              </span>
              <span className="font-semibold">{c.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Page URL or report link</span>
          <input
            type="url"
            className="min-h-11 w-full rounded-[8px] border border-border bg-white px-3"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tell us about the issue</span>
          <textarea
            required
            minLength={3}
            rows={5}
            className="w-full rounded-[8px] border border-border bg-white px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Follow-up email (optional)</span>
          <input
            type="email"
            className="min-h-11 w-full rounded-[8px] border border-border bg-white px-3"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </label>
        <div className="flex gap-3 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-3 text-sm">
          <span className="font-bold text-cobalt">i</span>
          <p>No account required.</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-orange">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Sending…" : "Submit report"}
        </button>
      </form>
    </Page>
  );
}

function ReportStatusView({
  caseNumber,
  token,
}: {
  caseNumber: string;
  token: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    caseNumber: string;
    category: string;
    status: string;
    isUrgent: boolean;
    urgentDeadlineAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/public/content-reports/${encodeURIComponent(caseNumber)}?token=${encodeURIComponent(token)}`,
          { headers: { accept: "application/json" } },
        );
        const body = await res.json();
        if (!res.ok) {
          throw new Error(String(body.message ?? "Case not found."));
        }
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load status.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseNumber, token]);

  if (loading) {
    return (
      <Page title="Report status" narrow>
        <p className="text-muted">Loading…</p>
      </Page>
    );
  }
  if (error || !data) {
    return (
      <Page title="Report status" narrow>
        <p role="alert">{error ?? "Not found."}</p>
      </Page>
    );
  }

  return (
    <Page title="Report status" narrow>
      <dl className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm mock-card-shadow">
        <div>
          <dt className="text-muted">Case</dt>
          <dd className="font-mono">{data.caseNumber}</dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd className="capitalize">{data.status}</dd>
        </div>
        <div>
          <dt className="text-muted">Category</dt>
          <dd>{data.category}</dd>
        </div>
        {data.isUrgent ? (
          <div>
            <dt className="text-muted">Urgent deadline</dt>
            <dd>
              {data.urgentDeadlineAt
                ? new Date(data.urgentDeadlineAt).toLocaleString()
                : "—"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">Updated</dt>
          <dd>{new Date(data.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <p className="mt-6">
        <Link to="/report-content" className="text-cobalt underline-offset-2 hover:underline">
          Submit another report
        </Link>
      </p>
    </Page>
  );
}

export function CopyrightPage() {
  const [agent, setAgent] = useState<{
    name: string;
    address: string;
    phone: string;
    email: string;
  } | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/legal`);
        const body = await res.json();
        if (!cancelled) {
          setAgent(body.copyrightRouteVisible ? body.copyrightAgent : null);
        }
      } catch {
        if (!cancelled) setAgent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (agent === undefined) {
    return (
      <Page title="Copyright" narrow>
        <p className="text-muted">Loading…</p>
      </Page>
    );
  }

  if (!agent) {
    return (
      <Page title="Copyright & takedowns" narrow>
        <div className="mb-5 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#fef3c7] to-[#e0e7ff] p-5">
          <p className="font-display text-xl font-bold">REAL NEIGHBORS REAL CHANGE</p>
        </div>
        <p className="mb-4 text-sm text-ink">
          A designated copyright agent is not published yet. This route stays
          hidden from site navigation until agent details are configured.
        </p>
        <p className="text-sm text-muted">
          For privacy or safety concerns, use{" "}
          <Link to="/report-content" className="text-cobalt underline-offset-2 hover:underline">
            Report content
          </Link>
          .
        </p>
      </Page>
    );
  }

  return (
    <Page title="Copyright & takedowns" narrow>
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#fef3c7] to-[#e0e7ff] p-5">
        <p className="font-display text-xl font-bold">REAL NEIGHBORS REAL CHANGE</p>
      </div>
      <p className="mb-4 text-sm text-ink">
        If material on this service infringes your copyright, contact our designated
        agent or use the form below.
      </p>
      <section className="mb-6 space-y-2 rounded-xl border border-border bg-surface p-4 text-sm mock-card-shadow">
        <h2 className="text-base font-bold">Designated agent</h2>
        <p>{agent.name}</p>
        <p className="whitespace-pre-line">{agent.address}</p>
        <p>
          Phone: {agent.phone}
          <br />
          Email:{" "}
          <a className="text-cobalt underline-offset-2 hover:underline" href={`mailto:${agent.email}`}>
            {agent.email}
          </a>
        </p>
      </section>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = `mailto:${agent.email}?subject=${encodeURIComponent("Copyright notice")}&body=${encodeURIComponent(`URL: ${url}\n\n${details}`)}`;
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">URL of the content</span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="min-h-11 w-full rounded-[8px] border border-border bg-white px-3"
            placeholder="https://…"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tell us about the issue</span>
          <textarea
            required
            rows={5}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-white px-3 py-2"
            placeholder="Describe the copyrighted work and the precise location of the material…"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white"
        >
          Submit request
        </button>
      </form>
    </Page>
  );
}

export function GuidelinesPage() {
  const items = [
    {
      title: "Be respectful",
      body: "Report the problem. Respect the people. Focus on infrastructure, not identifying people.",
      icon: "💬",
    },
    {
      title: "Share accurate information",
      body: "Show real public-space conditions. Distinguish observations from assumptions. Label old footage.",
      icon: "👥",
    },
    {
      title: "Keep NYC welcoming",
      body: "No intimate imagery, threats, private contact information, or harassment. Only upload content you have rights to share.",
      icon: "♥",
    },
  ];

  return (
    <Page title="Community guidelines" narrow>
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#dcfce7] to-[#dbeafe] p-5">
        <p className="font-display text-xl font-bold">KINDER CITIES BRIGHTER DAYS</p>
      </div>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li
            key={item.title}
            className="flex gap-4 rounded-xl border border-border bg-surface p-4 mock-card-shadow"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cobalt text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="flex items-center gap-2 font-bold">
                <span className="text-cobalt" aria-hidden="true">
                  {item.icon}
                </span>
                {item.title}
              </p>
              <p className="mt-1 text-sm text-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        Use{" "}
        <Link to="/report-content" className="text-cobalt underline-offset-2 hover:underline">
          Report content
        </Link>{" "}
        for concerns.
      </p>
    </Page>
  );
}

/** Tiny helper exported for tests / future share UI */
export function useReportContentHref(pageUrl?: string) {
  return useMemo(() => {
    if (!pageUrl) return "/report-content";
    return `/report-content?url=${encodeURIComponent(pageUrl)}`;
  }, [pageUrl]);
}
