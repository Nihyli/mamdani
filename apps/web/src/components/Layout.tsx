import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { brand, disclaimer } from "../lib/brand";
import { useAuth } from "../lib/auth";

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold",
    isActive ? "text-cobalt" : "text-muted",
  ].join(" ");

const desktopNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-10 items-center px-2.5 text-sm font-medium",
    isActive ? "text-ink" : "text-muted hover:text-ink",
  ].join(" ");

export function AppShell() {
  const location = useLocation();
  const hideBottom = location.pathname.startsWith("/submit");
  const isMap = location.pathname === "/";
  const auth = useAuth();

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex min-h-11 min-w-0 items-center gap-3 py-1">
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                {brand.name}
              </span>
              <span className="hidden truncate text-[11px] font-medium text-muted sm:block">
                {brand.tagline}
              </span>
            </span>
          </Link>
          <nav
            className="hidden flex-1 items-center justify-center gap-1 md:flex"
            aria-label="Desktop primary"
          >
            <NavLink to="/" end className={desktopNavClass}>
              Map
            </NavLink>
            <NavLink to="/fixed" className={desktopNavClass}>
              Fixed
            </NavLink>
            <NavLink to="/my-reports" className={desktopNavClass}>
              My reports
            </NavLink>
            <NavLink to="/about" className={desktopNavClass}>
              About
            </NavLink>
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to="/submit"
              className="inline-flex min-h-10 items-center gap-1 rounded-[8px] bg-cobalt px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] sm:px-4"
            >
              <span aria-hidden="true">+</span>
              <span className="sr-only sm:not-sr-only">Add a report</span>
              <span className="sm:hidden">Add</span>
            </Link>
            {auth.userId ? (
              <Link
                to="/settings"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-xs font-bold text-ink hover:border-border-strong"
                aria-label="Settings"
              >
                Me
              </Link>
            ) : (
              <Link
                to="/sign-in"
                className="inline-flex min-h-10 items-center rounded-[8px] px-2 text-sm font-semibold text-cobalt hover:bg-cobalt/10"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        className={`flex-1 ${hideBottom ? "pb-4" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"} md:pb-0`}
      >
        <Outlet />
      </main>

      {!hideBottom && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Primary"
        >
          <div className="relative flex h-[4.25rem] items-end gap-0.5 px-1 pb-1.5 pt-2">
            <NavLink to="/" end className={navClass}>
              <NavIcon kind="map" />
              Map
            </NavLink>
            <NavLink to="/fixed" className={navClass}>
              <NavIcon kind="fixed" />
              Fixed
            </NavLink>
            <div className="relative flex flex-1 justify-center">
              <Link
                to="/submit"
                className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-cobalt text-2xl font-light text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)]"
                aria-label="Add a report"
              >
                +
              </Link>
              <span className="mt-8 text-[10px] font-semibold text-muted">Add</span>
            </div>
            <NavLink to="/my-reports" className={navClass}>
              <NavIcon kind="reports" />
              My reports
            </NavLink>
            <NavLink to="/about" className={navClass}>
              <NavIcon kind="more" />
              More
            </NavLink>
          </div>
        </nav>
      )}

      {!isMap ? <SiteFooter /> : null}
    </div>
  );
}

function NavIcon({ kind }: { kind: "map" | "fixed" | "reports" | "more" }) {
  const common = "h-5 w-5";
  if (kind === "map") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13L15 6.5l-6-2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9 4.5v13M15 6.5v13" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (kind === "fixed") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m8.5 12.2 2.4 2.4 4.6-5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "reports") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 4.5h8.5L19 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M15 4.5V8h3.5M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function SiteFooter() {
  const [showCopyright, setShowCopyright] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:8787"}/api/public/legal`,
        );
        const body = await res.json();
        if (!cancelled) setShowCopyright(Boolean(body.copyrightRouteVisible));
      } catch {
        if (!cancelled) setShowCopyright(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="mt-auto border-t border-border bg-panel px-4 py-5 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-display text-base font-bold text-ink">{brand.name}</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed md:text-sm">{disclaimer}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs md:gap-x-4 md:text-sm">
          <Link to="/about" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            About
          </Link>
          <Link to="/terms" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Terms
          </Link>
          <Link to="/privacy" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Privacy
          </Link>
          <Link to="/guidelines" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Guidelines
          </Link>
          <Link to="/report-content" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Report content
          </Link>
          {showCopyright ? (
            <Link to="/copyright" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
              Copyright
            </Link>
          ) : null}
          <Link to="/settings" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Settings
          </Link>
          <Link to="/admin" className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">
            Review
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function Page({
  title,
  subtitle,
  children,
  narrow,
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  narrow?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className={`mx-auto px-4 py-6 sm:py-8 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>
      {title || actions ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title ? (
              <h1 className="font-display text-[2rem] font-bold leading-none tracking-[-0.02em] sm:text-4xl">
                {title}
              </h1>
            ) : null}
            {subtitle ? <p className="mt-2 max-w-2xl text-muted">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="px-4 py-8 text-muted">
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-open/25 bg-open/10 px-4 py-5">
      <p className="text-ink">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-[8px] border border-border bg-surface px-4 font-semibold hover:border-border-strong"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border-strong bg-panel px-4 py-10 text-center">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="mx-auto max-w-md text-muted">{body}</p>
      {action}
    </div>
  );
}
