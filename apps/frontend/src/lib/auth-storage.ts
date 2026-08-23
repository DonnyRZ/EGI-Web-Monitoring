const ACCESS_KEY = "egi_access_token";
const USER_KEY = "egi_user";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const sessionValue = window.sessionStorage.getItem(key);
    if (sessionValue !== null) {
      // Migrate an existing session created by the pre-performance build so
      // its first newly opened tab gets the same fast bootstrap path.
      window.localStorage.setItem(key, sessionValue);
      return sessionValue;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
    // Keep the short-lived access token available to a newly opened tab. The
    // refresh cookie remains HttpOnly and is still the source of truth when
    // the access token expires.
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures; the in-memory auth state is cleared.
  }
}

export function getAccessToken(): string | null {
  return readStorage(ACCESS_KEY);
}

export function setTokens(access: string) {
  writeStorage(ACCESS_KEY, access);
}

export function clearAuthStorage() {
  removeStorage(ACCESS_KEY);
  removeStorage(USER_KEY);
}

export function getStoredUser<T>(): T | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown) {
  writeStorage(USER_KEY, JSON.stringify(user));
}
