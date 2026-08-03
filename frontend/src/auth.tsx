import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserPublic } from "@kshiai/shared";
import { api } from "./api";
import { requireSupabase, supabase, supabaseConfigured } from "./supabase";

type AuthState = {
  user: UserPublic | null;
  loading: boolean;
  confirmationSent: boolean;
  supabaseConfigured: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function callbackUrl(next?: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api.me();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        window.setTimeout(() => void refresh(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setConfirmationSent(false);
    if (!supabase) {
      const { user: current } = await api.login(email, password);
      setUser(current);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const register = useCallback(async (email: string, password: string) => {
    setConfirmationSent(false);
    if (!supabase) {
      const { user: current } = await api.register(email, password);
      setUser(current);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) throw error;
    if (!data.session) {
      setConfirmationSent(true);
      setUser(null);
      return;
    }
    await refresh();
  }, [refresh]);

  const loginWithGoogle = useCallback(async () => {
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/reset-password"),
    });
    if (error) throw error;
    setConfirmationSent(true);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } else {
      await api.logout();
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      confirmationSent,
      supabaseConfigured,
      refresh,
      login,
      register,
      loginWithGoogle,
      requestPasswordReset,
      updatePassword,
      logout,
    }),
    [
      user,
      loading,
      confirmationSent,
      refresh,
      login,
      register,
      loginWithGoogle,
      requestPasswordReset,
      updatePassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth outside provider");
  return context;
}
