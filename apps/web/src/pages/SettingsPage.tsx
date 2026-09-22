import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Page } from "../components/Layout";

type Tab = "account" | "notifications" | "privacy";

export function SettingsPage() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("notifications");
  const [toggles, setToggles] = useState({
    issueUpdates: true,
    nearby: false,
    digest: true,
    marketing: false,
    tiktokChoice: true,
  });

  function toggle(key: keyof typeof toggles) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <Page
      title="Settings"
      subtitle="Manage your account and preferences."
      narrow
    >
      {!auth.userId ? (
        <p className="mb-4 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-muted">
          Sign in to sync preferences across devices. Local toggles below are a
          design preview only.{" "}
          <Link to="/sign-in?next=/settings" className="font-semibold text-cobalt">
            Sign in
          </Link>
        </p>
      ) : null}

      <div className="mb-6 flex gap-4 border-b border-border text-sm font-semibold">
        {(
          [
            ["account", "Account"],
            ["notifications", "Notifications"],
            ["privacy", "Privacy"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`pb-2 ${
              tab === id
                ? "border-b-2 border-cobalt text-cobalt"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "account" ? (
        <section className="space-y-3">
          <SettingsRow
            icon="👤"
            title="Signed-in account"
            body={
              auth.userId
                ? `Signed in as ${auth.userId.slice(0, 8)}…`
                : "Not signed in"
            }
          />
          {auth.userId ? (
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="inline-flex min-h-11 items-center rounded-[8px] border border-border px-4 text-sm font-semibold"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/sign-in?next=/settings"
              className="inline-flex min-h-11 items-center rounded-[8px] bg-cobalt px-4 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          )}
        </section>
      ) : null}

      {tab === "notifications" ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-1 text-base font-bold">Issue updates</h2>
            <p className="mb-3 text-sm text-muted">
              Hear when reports you follow change status.
            </p>
            <div className="space-y-2">
              <ToggleCard
                icon="🔔"
                title="Issue update notifications"
                body="When a followed report is updated or verified fixed."
                on={toggles.issueUpdates}
                onToggle={() => toggle("issueUpdates")}
              />
              <ToggleCard
                icon="📍"
                title="Nearby issues"
                body="Optional alerts for new reports near places you care about."
                on={toggles.nearby}
                onToggle={() => toggle("nearby")}
              />
            </div>
          </section>
          <section>
            <h2 className="mb-1 text-base font-bold">Email digest</h2>
            <p className="mb-3 text-sm text-muted">A weekly summary of progress.</p>
            <ToggleCard
              icon="✉️"
              title="Weekly digest"
              body="Highlights from the fixed feed and your reports."
              on={toggles.digest}
              onToggle={() => toggle("digest")}
            />
          </section>
          <section>
            <h2 className="mb-1 text-base font-bold">Marketing</h2>
            <p className="mb-3 text-sm text-muted">Product and community news.</p>
            <ToggleCard
              icon="📣"
              title="Product updates and community news"
              body="Occasional notes about the project. Not ads."
              on={toggles.marketing}
              onToggle={() => toggle("marketing")}
            />
          </section>
        </div>
      ) : null}

      {tab === "privacy" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Privacy controls for your account data and how external media loads.
          </p>
          <Link
            to="/report-content"
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 mock-card-shadow"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden="true">⬇️</span>
              <span>
                <span className="block font-semibold">Download my data</span>
                <span className="text-sm text-muted">Request an export of your account data.</span>
              </span>
            </span>
            <span className="text-muted">›</span>
          </Link>
          <Link
            to="/report-content"
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 mock-card-shadow"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden="true">✏️</span>
              <span>
                <span className="block font-semibold">Request a correction</span>
                <span className="text-sm text-muted">Ask us to fix inaccurate personal data.</span>
              </span>
            </span>
            <span className="text-muted">›</span>
          </Link>
          <Link
            to="/report-content"
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 mock-card-shadow"
          >
            <span className="flex items-center gap-3">
              <span className="text-open" aria-hidden="true">
                🗑
              </span>
              <span>
                <span className="block font-semibold text-open">Delete my account</span>
                <span className="text-sm text-muted">Start an account deletion request.</span>
              </span>
            </span>
            <span className="text-muted">›</span>
          </Link>

          <section className="pt-2">
            <h2 className="mb-1 text-base font-bold">External media</h2>
            <p className="mb-3 text-sm text-muted">
              Choose when third-party players can load.
            </p>
            <ToggleCard
              icon="▶"
              title="Load TikTok videos only when I choose"
              body="Keeps embeds off until you tap Load."
              on={toggles.tiktokChoice}
              onToggle={() => toggle("tiktokChoice")}
            />
            <Link
              to="/privacy"
              className="mt-3 inline-flex text-sm font-semibold text-cobalt underline-offset-2 hover:underline"
            >
              Learn more about external media.
            </Link>
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function SettingsRow({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 mock-card-shadow">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}

function ToggleCard({
  icon,
  title,
  body,
  on,
  onToggle,
}: {
  icon: string;
  title: string;
  body: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 mock-card-shadow">
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-cobalt" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
