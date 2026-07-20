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
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    try {
      const refreshed = token ? null : await authApi.refresh();
      if (refreshed) setTokens(refreshed.access_token);
      const me = refreshed?.user ?? await authApi.me();
      setUser(me);
      setStoredUser(me);
    } catch {
      clearAuthStorage();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const cached = getStoredUser<User>();
    const hasCachedSession = Boolean(cached && getAccessToken());
    if (hasCachedSession) {
      setUser(cached);
      setLoading(false);
    }
    refreshUser().finally(() => {
      if (!hasCachedSession) setLoading(false);
    });
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
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
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
