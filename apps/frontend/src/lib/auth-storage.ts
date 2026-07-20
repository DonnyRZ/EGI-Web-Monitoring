const ACCESS_KEY = "egi_access_token";
const USER_KEY = "egi_user";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string) {
  sessionStorage.setItem(ACCESS_KEY, access);
}

export function clearAuthStorage() {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getStoredUser<T>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}
