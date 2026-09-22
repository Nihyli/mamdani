import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthHeaders } from "./api";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const allowDevAuth = import.meta.env.VITE_ALLOW_DEV_AUTH === "true";

export const authConfigured = Boolean(supabaseUrl && supabaseAnon);

let supabase: SupabaseClient | null = null;
if (authConfigured) {
  supabase = createClient(supabaseUrl, supabaseAnon);
}

type AuthState = {
  ready: boolean;
  authConfigured: boolean;
  allowDevAuth: boolean;
  session: Session | null;
  /** In-memory only when VITE_ALLOW_DEV_AUTH=true and Supabase unset */
  devUserId: string | null;
  userId: string | null;
  email: string | null;
  authHeaders: AuthHeaders | undefined;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  enableDevAuth: (userId: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!authConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [devUserId, setDevUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: "Authentication is not configured." };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    setDevUserId(null);
    if (supabase) await supabase.auth.signOut();
  }, []);

  const enableDevAuth = useCallback((userId: string) => {
    if (!allowDevAuth || authConfigured) return;
    setDevUserId(userId.trim() || null);
  }, []);

  const userId = session?.user.id ?? (allowDevAuth ? devUserId : null);
  const email = session?.user.email ?? null;

  const authHeaders = useMemo((): AuthHeaders | undefined => {
    if (session?.access_token) {
      return { authorization: `Bearer ${session.access_token}` };
    }
    if (allowDevAuth && !authConfigured && devUserId) {
      return { devUserId };
    }
    return undefined;
  }, [session, devUserId]);

  const value = useMemo(
    () => ({
      ready,
      authConfigured,
      allowDevAuth,
      session,
      devUserId,
      userId,
      email,
      authHeaders,
      signInWithEmail,
      signOut,
      enableDevAuth,
    }),
    [
      ready,
      session,
      devUserId,
      userId,
      email,
      authHeaders,
      signInWithEmail,
      signOut,
      enableDevAuth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
