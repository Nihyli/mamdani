import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Page } from "../components/Layout";

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
    // Matches db/scripts/seed.sh local admin fixture
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
    <Page title="Sign in" narrow>
      {!auth.authConfigured ? (
        <div
          role="status"
          className="mb-6 rounded-md border border-pending/40 bg-pending/10 px-4 py-3"
        >
          <p className="font-semibold">Auth not configured</p>
          <p className="mt-1 text-sm text-muted">
            Set <code className="text-ink">VITE_SUPABASE_URL</code> and{" "}
            <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> to enable
            Supabase email sign-in.
          </p>
        </div>
      ) : null}

      {auth.authConfigured ? (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3"
              autoComplete="email"
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
            className="inline-flex min-h-11 items-center rounded-md bg-cobalt px-4 font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      ) : null}

      {!auth.authConfigured && auth.allowDevAuth ? (
        <form onSubmit={onDevSignIn} className="mt-6 space-y-4 border-t border-border pt-6">
          <p className="text-sm font-medium text-orange">
            Dev-only path (VITE_ALLOW_DEV_AUTH=true)
          </p>
          <p className="text-sm text-muted">
            Stores a user id in memory and sends{" "}
            <code className="text-ink">x-dev-user-id</code> to the API. Not for
            production.
          </p>
          <div>
            <label htmlFor="dev-user" className="mb-2 block font-medium">
              Dev user id
            </label>
            <input
              id="dev-user"
              value={devUserId}
              onChange={(e) => setDevUserId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3 font-mono text-sm"
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
            className="inline-flex min-h-11 items-center rounded-md border border-orange px-4 font-semibold text-orange"
          >
            Continue with dev user
          </button>
        </form>
      ) : null}

      {!auth.authConfigured && !auth.allowDevAuth ? (
        <p className="mt-4 text-sm text-muted">
          Enable <code className="text-ink">VITE_ALLOW_DEV_AUTH=true</code> for a
          local in-memory user when Supabase is unset.
        </p>
      ) : null}
    </Page>
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
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I am 18 or older and agree to the{" "}
        <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
          Terms of Use
        </Link>
        . See also the{" "}
        <Link to="/privacy" className="text-cobalt underline-offset-2 hover:underline">
          Privacy Notice
        </Link>
        .
      </span>
    </label>
  );
}
