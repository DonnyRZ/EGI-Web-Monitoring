"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { authApi } from "./api-services";
import {
  clearAuthStorage,
  getAccessToken,
  getStoredUser,
  setStoredUser,
  setTokens,
} from "./auth-storage";
import { clearApiCache } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let refreshUserRequest: Promise<void> | null = null;
let authMutationVersion = 0;

const PUBLIC_AUTH_ROUTES = new Set(["/login", "/forgot-password", "/reset-password"]);
const PUBLIC_BOOTSTRAP_TIMEOUT_MS = 1_500;
const PROTECTED_BOOTSTRAP_TIMEOUT_MS = 4_000;

function sameUser(a: User | null, b: User | null) {
  if (!a || !b) return a === b;
  return a.id === b.id
    && a.email === b.email
    && a.name === b.name
    && a.role === b.role
    && a.is_active === b.is_active
    && a.updated_at === b.updated_at;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    const requestVersion = authMutationVersion;
    if (!refreshUserRequest) {
      refreshUserRequest = (async () => {
        const token = getAccessToken();
        try {
          const refreshed = token ? null : await authApi.refresh();
          if (refreshed) setTokens(refreshed.access_token);
          const me = refreshed?.user ?? await authApi.me();
          if (requestVersion !== authMutationVersion) return;
          setUser((current) => sameUser(current, me) ? current : me);
          setStoredUser(me);
        } catch (error) {
          if (requestVersion !== authMutationVersion) return;
          // A temporary network/API outage must not log a cached user out or
          // make every page redirect to login. Only an explicit auth failure
          // invalidates the local identity.
          if (error instanceof Error && "status" in error) {
            const status = Number((error as { status?: number }).status);
            if (status === 0 || status === 408 || status === 429 || status >= 500) return;
          }
          clearAuthStorage();
          setUser(null);
        }
      })().finally(() => {
        refreshUserRequest = null;
      });
    }
    return refreshUserRequest;
  }, []);

  useEffect(() => {
    const cached = getStoredUser<User>();
    const hasCachedSession = Boolean(cached && getAccessToken());
    if (hasCachedSession) {
      setUser(cached);
      // Cached identity can render the workspace immediately. The background
      // refresh is single-flight and preserves object identity when nothing
      // changed, so pages do not refetch merely because /auth/me completed.
      setLoading(false);
      const refreshTimer = window.setTimeout(() => {
        void refreshUser();
      }, 5_000);
      return () => window.clearTimeout(refreshTimer);
    }
    let active = true;
    const timeoutMs = PUBLIC_AUTH_ROUTES.has(pathname)
      ? PUBLIC_BOOTSTRAP_TIMEOUT_MS
      : PROTECTED_BOOTSTRAP_TIMEOUT_MS;
    const bootstrapTimer = window.setTimeout(() => {
      if (active) setLoading(false);
    }, timeoutMs);
    refreshUser().finally(() => {
      window.clearTimeout(bootstrapTimer);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      window.clearTimeout(bootstrapTimer);
    };
  }, [pathname, refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    authMutationVersion += 1;
    const res = await authApi.login(email, password);
    clearApiCache();
    setTokens(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const loginAsGuest = useCallback(async () => {
    authMutationVersion += 1;
    const res = await authApi.guest();
    clearApiCache();
    setTokens(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    authMutationVersion += 1;
    try {
      await authApi.logout();
    } catch {
      // ignore logout API errors
    }
    clearApiCache();
    clearAuthStorage();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginAsGuest, logout, refreshUser }),
    [user, loading, login, loginAsGuest, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
