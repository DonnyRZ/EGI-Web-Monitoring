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
import { authApi } from "./api-services";
import {
  clearAuthStorage,
  getAccessToken,
  getStoredUser,
  setStoredUser,
  setTokens,
} from "./auth-storage";
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

  const refreshUser = useCallback(async () => {
    if (!refreshUserRequest) {
      refreshUserRequest = (async () => {
        const token = getAccessToken();
        try {
          const refreshed = token ? null : await authApi.refresh();
          if (refreshed) setTokens(refreshed.access_token);
          const me = refreshed?.user ?? await authApi.me();
          setUser((current) => sameUser(current, me) ? current : me);
          setStoredUser(me);
        } catch {
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
    }
    refreshUser().finally(() => {
      setLoading(false);
    });
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokens(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const loginAsGuest = useCallback(async () => {
    const res = await authApi.guest();
    setTokens(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout API errors
    }
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
