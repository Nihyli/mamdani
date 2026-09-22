import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { brand, disclaimer } from "../lib/brand";
import { useAuth } from "../lib/auth";

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium",
    isActive ? "text-cobalt" : "text-muted",
  ].join(" ");

export function AppShell() {
  const location = useLocation();
  const hideBottom = location.pathname.startsWith("/submit");
  const auth = useAuth();

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="min-h-11 min-w-0 py-2">
            <span className="block truncate text-lg font-semibold tracking-tight">
              {brand.name}
            </span>
            <span className="block truncate text-xs text-muted">{brand.tagline}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/submit"
              className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 text-sm font-semibold text-white"
            >
              Add a report
            </Link>
            {auth.userId ? (
              <button
                type="button"
                onClick={() => void auth.signOut()}
                className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/sign-in"
                className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-cobalt"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className={`flex-1 ${hideBottom ? "pb-4" : "pb-[calc(3.5rem+env(safe-area-inset-bottom))]"} md:pb-0`}>
        <Outlet />
      </main>

      {!hideBottom && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Primary"
        >
          <div className="flex h-14">
            <NavLink to="/" end className={navClass}>
              Map
            </NavLink>
            <NavLink to="/fixed" className={navClass}>
              Fixed
            </NavLink>
            <NavLink to="/submit" className={navClass}>
              Add
            </NavLink>
            <NavLink to="/my-reports" className={navClass}>
              My reports
            </NavLink>
          </div>
        </nav>
      )}

      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-canvas px-4 py-4 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <p className="max-w-xl">{disclaimer}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/terms" className="underline-offset-2 hover:underline">
            Terms
          </Link>
          <Link to="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </Link>
          <Link to="/admin" className="underline-offset-2 hover:underline">
            Review
          </Link>
          <Link to="/sign-in" className="underline-offset-2 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function Page({
  title,
  children,
  narrow,
}: {
  title?: string;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className={`mx-auto px-4 py-6 ${narrow ? "max-w-xl" : "max-w-6xl"}`}>
      {title ? <h1 className="mb-4 text-2xl font-semibold tracking-tight">{title}</h1> : null}
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
    <div role="alert" className="space-y-3 px-4 py-8">
      <p className="text-ink">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 font-medium"
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
    <div className="space-y-3 px-4 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto max-w-md text-muted">{body}</p>
      {action}
    </div>
  );
}
