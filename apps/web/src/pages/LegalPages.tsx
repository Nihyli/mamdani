import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LegalOperatorConfig } from "@mamdani-ticketer/contracts";
import { brand, disclaimer } from "../lib/brand";
import { API_BASE } from "../lib/api";
import { Page } from "../components/Layout";

type LegalPayload = {
  draft: true;
  legal: LegalOperatorConfig;
  copyrightRouteVisible: boolean;
};

function useLegal(): LegalPayload | null {
  const [legal, setLegal] = useState<LegalPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/legal`);
        const body = (await res.json()) as LegalPayload;
        if (!cancelled) setLegal(body);
      } catch {
        if (!cancelled) {
          setLegal({
            draft: true,
            copyrightRouteVisible: false,
            legal: {
              policyVersion: "0.1.0-draft",
              effectiveDate: null,
              operatorName: null,
              operatorAddress: null,
              supportEmail: null,
              privacyEmail: null,
              appealEmail: null,
              safetyPath: "/report-content",
              privacyRequestPath: "/report-content",
              copyrightPath: "/copyright",
              hostingProviders: null,
              analysisProviders: null,
              analyticsDescription:
                "None — essential session/security storage and interface preferences only.",
              dntResponse:
                "Honored where feasible; no advertising trackers in the launch design.",
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return legal;
}

function field(value: string | null | undefined, placeholder: string): string {
  return value?.trim() || placeholder;
}

function HeroArt({ caption }: { caption: string }) {
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#dbeafe] via-[#ecfdf5] to-[#fef3c7] p-5 mock-card-shadow sm:p-6">
      <p className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {caption}
      </p>
      <p className="mt-2 max-w-md text-sm text-muted">{brand.tagline}</p>
    </div>
  );
}

export function AboutPage() {
  return (
    <Page title={`About ${brand.name}`} narrow>
      <HeroArt caption="SAME CITY BRIGHTER TOMORROW" />
      <p className="mb-4 text-lg font-semibold text-ink">
        A community map for things that need fixing.
      </p>
      <p className="mb-4 text-ink">
        {brand.name} is an unofficial map of public-space problems in New York
        City, and a record of what got fixed. {brand.tagline}
      </p>
      <p className="mb-6 text-sm text-muted">{disclaimer}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { to: "/guidelines", title: "How it works", body: "Report, review, verify." },
          { to: "/terms", title: "FAQ", body: "What we are — and are not." },
          { to: "/report-content", title: "Get in touch", body: "Safety and support paths." },
        ].map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-xl border border-border bg-surface p-4 mock-card-shadow hover:border-border-strong"
          >
            <p className="font-bold text-cobalt">{card.title} →</p>
            <p className="mt-1 text-sm text-muted">{card.body}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href="https://portal.311.nyc.gov/"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-fixed/25 bg-fixed/10 px-4 py-3 text-sm font-semibold text-fixed"
        >
          Use NYC 311 ↗
        </a>
        <div className="rounded-xl border border-open/25 bg-open/10 px-4 py-3 text-sm text-ink">
          <p className="font-semibold text-open">Not an emergency service</p>
          <p className="mt-1 text-muted">For immediate danger, call 911.</p>
        </div>
      </div>
    </Page>
  );
}

export function TermsPage() {
  const payload = useLegal();
  const legal = payload?.legal;
  const sections = [
    { id: "mission", title: "Our mission" },
    { id: "service", title: "Using the service" },
    { id: "accounts", title: "Accounts and agreement" },
    { id: "content", title: "Your content and permission" },
    { id: "moderation", title: "Accuracy and moderation" },
    { id: "external", title: "External services and removal" },
  ];

  return (
    <Page title="Terms of Use">
      <DraftBanner />
      <HeroArt caption="A STRONGER NYC TOGETHER" />
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="rounded-xl border border-border bg-surface p-4 text-sm mock-card-shadow lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            On this page
          </p>
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="font-semibold text-cobalt underline-offset-2 hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-w-3xl">
          <p className="mb-4 text-sm text-muted">
            Last updated: {field(legal?.effectiveDate, "[DATE]")} · Policy version{" "}
            {field(legal?.policyVersion, "[POLICY VERSION]")} ·{" "}
            <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-semibold">
              Design preview — sample data
            </span>
          </p>
          <section id="mission" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">1. Our mission</h2>
            <p>
              {brand.name} is an independent community service for reporting and
              reviewing public-space conditions in New York City. Operator:{" "}
              {field(legal?.operatorName, "[LEGAL OPERATOR NAME]")}.
            </p>
          </section>
          <section id="service" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">2. Using the service</h2>
            <p>
              We are not affiliated with, authorized by, or endorsed by Zohran Mamdani,
              his office, the City of New York, TikTok, or any government agency.
              Publishing here does not file a government service request. This is not
              an emergency service — call 911 for immediate danger.
            </p>
          </section>
          <section id="accounts" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">3. Accounts and agreement</h2>
            <p>
              You must be at least 18 to create an account or submit material.
              Selecting the agreement checkbox and creating an account signifies
              agreement to these Terms. Public reports can be browsed without an
              account.
            </p>
          </section>
          <section id="content" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">4. Your content and permission</h2>
            <p>
              You retain your rights in submitted material. You must own it or have
              adequate permission for its submission and our permitted use. You grant{" "}
              {field(legal?.operatorName, "[OPERATOR]")} a nonexclusive license to
              operate the service — not an ownership transfer.
            </p>
          </section>
          <section id="moderation" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">5. Accuracy and moderation</h2>
            <p>
              Human review does not guarantee accuracy or safety. “Verified fixed”
              means evidence was accepted as of the displayed date. Appeals:{" "}
              {legal?.appealEmail ? (
                <a
                  className="text-cobalt underline-offset-2 hover:underline"
                  href={`mailto:${legal.appealEmail}`}
                >
                  {legal.appealEmail}
                </a>
              ) : (
                "[APPEAL FORM]"
              )}
              .
            </p>
          </section>
          <section id="external" className="mb-6 space-y-2 text-sm text-ink">
            <h2 className="text-lg font-bold">6. External services and removal</h2>
            <p>
              Use{" "}
              <Link
                to={legal?.privacyRequestPath ?? "/report-content"}
                className="text-cobalt underline-offset-2 hover:underline"
              >
                Report content
              </Link>{" "}
              for data requests and urgent harmful content
              {payload?.copyrightRouteVisible ? (
                <>
                  , and{" "}
                  <Link to="/copyright" className="text-cobalt underline-offset-2 hover:underline">
                    Copyright
                  </Link>{" "}
                  for ownership claims
                </>
              ) : null}
              .
            </p>
          </section>
          <p className="text-sm text-muted">{disclaimer}</p>
        </div>
      </div>
    </Page>
  );
}

export function PrivacyPage() {
  const payload = useLegal();
  const legal = payload?.legal;
  return (
    <Page title="Privacy Notice" narrow>
      <DraftBanner />
      <HeroArt caption="PEOPLE PLACES PROGRESS" />
      <p className="mb-6 text-sm text-muted">
        Policy version: {field(legal?.policyVersion, "[POLICY VERSION]")}.
        Effective date {field(legal?.effectiveDate, "[DATE]")}. Contact{" "}
        {field(legal?.privacyEmail, "[PRIVACY EMAIL]")}.
      </p>

      <h2 className="mb-3 text-lg font-bold">Information we collect</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: "👤", title: "Account", body: "Email / login identifier and display name." },
          { icon: "📄", title: "Uploads", body: "Text, links, photos/video and observation dates." },
          { icon: "📍", title: "Location", body: "Issue coordinates you confirm for the map." },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border bg-surface p-4 mock-card-shadow">
            <p className="text-xl text-cobalt" aria-hidden="true">
              {card.icon}
            </p>
            <p className="mt-2 font-bold">{card.title}</p>
            <p className="mt-1 text-sm text-muted">{card.body}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-bold">Providers & cookies</h2>
        <p>
          We use {field(legal?.hostingProviders, "[HOSTING PROVIDERS]")} and may use{" "}
          {field(legal?.analysisProviders, "[ANALYSIS PROVIDERS]")} when analysis is
          enabled. {field(legal?.analyticsDescription, "[ANALYTICS]")} Do Not Track:{" "}
          {field(legal?.dntResponse, "[DNT RESPONSE]")}.
        </p>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-xl text-cobalt" aria-hidden="true">
            🛡
          </span>
          <div>
            <p className="font-bold">You control your data</p>
            <p className="text-sm text-muted">Manage privacy preferences anytime.</p>
          </div>
        </div>
        <Link
          to="/settings"
          className="inline-flex min-h-10 items-center justify-center rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white"
        >
          Manage privacy
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">{disclaimer}</p>
    </Page>
  );
}

function DraftBanner() {
  return (
    <div
      role="status"
      className="mb-4 rounded-[8px] border border-orange/50 bg-orange/10 px-3 py-2 text-sm font-semibold text-orange"
    >
      DRAFT — not counsel-approved. Production readiness fails until required
      operator and contact fields are set in environment configuration.
    </div>
  );
}
