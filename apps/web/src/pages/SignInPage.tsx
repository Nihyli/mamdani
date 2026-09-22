import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { brand } from "../lib/brand";

export function SignInPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/my-reports";

  const [email, setEmail] = useState("");
  const [ageAgreed, setAgeAgreed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devUserId, setDevUserId] = useState<string>(
    "00000000-0000-4000-8000-000000000001",
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!ageAgreed) {
      setError("Confirm you are 18 or older and agree to the Terms of Use.");
      return;
    }
    if (!auth.authConfigured) {
      setError("Authentication is not configured.");
      return;
    }
    setBusy(true);
    const result = await auth.signInWithEmail(email.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Check your email for a sign-in link.");
  }

  function onDevSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ageAgreed) {
      setError("Confirm you are 18 or older and agree to the Terms of Use.");
      return;
    }
    auth.enableDevAuth(devUserId);
    navigate(next);
  }

  return (
    <div className="relative min-h-[calc(100dvh-4.5rem)] overflow-hidden">
      <div className="mock-map-art absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[22rem_1fr] md:py-10">
        <section className="rounded-xl border border-border bg-surface p-5 mock-card-shadow md:p-7">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            A cleaner, brighter NYC starts with you.
          </p>
          <h1 className="text-[2rem] font-bold leading-none tracking-tight sm:text-[2.35rem]">
            Keep track of your reports
          </h1>
          <p className="mt-3 text-muted">
            Sign in to save your reports, get updates and help make a better New York.
          </p>

          {!auth.authConfigured ? (
            <div
              role="status"
              className="my-5 rounded-xl border border-pending/40 bg-pending/10 px-4 py-3"
            >
              <p className="font-bold">Auth not configured</p>
              <p className="mt-1 text-sm text-muted">
                Set <code className="text-ink">VITE_SUPABASE_URL</code> and{" "}
                <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> to enable
                Supabase email sign-in.
              </p>
            </div>
          ) : null}

          {auth.authConfigured ? (
            <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-12 w-full rounded-[8px] border border-border bg-surface px-3"
                  autoComplete="email"
                  placeholder="Enter your email"
                />
              </div>

              <AgeCheckbox checked={ageAgreed} onChange={setAgeAgreed} />

              {error ? (
                <p role="alert" className="text-sm text-open">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p role="status" className="text-sm text-fixed">
                  {message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-cobalt px-4 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send sign-in link"}
              </button>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                disabled
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] border border-border bg-surface px-4 text-sm font-semibold text-muted disabled:opacity-70"
              >
                Continue with Google
              </button>
            </form>
          ) : null}

          {!auth.authConfigured && auth.allowDevAuth ? (
            <form onSubmit={onDevSignIn} className="mt-6 space-y-4 border-t border-border pt-6">
              <p className="text-sm font-medium text-orange">
                Dev-only path (VITE_ALLOW_DEV_AUTH=true)
              </p>
              <div>
                <label htmlFor="dev-user" className="mb-2 block font-medium">
                  Dev user id
                </label>
                <input
                  id="dev-user"
                  value={devUserId}
                  onChange={(e) => setDevUserId(e.target.value)}
                  className="min-h-11 w-full rounded-[8px] border border-border bg-surface px-3 font-mono text-sm"
                />
              </div>
              <AgeCheckbox checked={ageAgreed} onChange={setAgeAgreed} />
              {error ? (
                <p role="alert" className="text-sm text-open">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-[8px] border border-orange px-4 font-bold text-orange"
              >
                Continue with dev user
              </button>
            </form>
          ) : null}

          <Link to="/" className="mt-5 inline-flex text-sm font-semibold text-cobalt">
            Continue browsing →
          </Link>
        </section>

        <section className="hidden items-end justify-end p-6 md:flex">
          <p className="max-w-xs text-right font-display text-lg italic text-ink/80">
            A kinder, cleaner NYC is a stronger NYC.
          </p>
          <p className="sr-only">{brand.name}</p>
        </section>
      </div>
    </div>
  );
}

function AgeCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-cobalt"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I am 18 or older and agree to the{" "}
        <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
          Terms
        </Link>
        .{" "}
        <Link to="/privacy" className="text-cobalt underline-offset-2 hover:underline">
          See our Privacy Notice.
        </Link>
      </span>
    </label>
  );
}
