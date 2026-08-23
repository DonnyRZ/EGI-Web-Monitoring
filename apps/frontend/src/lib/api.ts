import {
  clearAuthStorage,
  getAccessToken,
  setTokens,
  setStoredUser,
} from "./auth-storage";
import type { ApiErrorBody, LoginResponse } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3001/api";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  skipRefresh?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

type GetCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const getCache = new Map<string, GetCacheEntry>();
const getRequests = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;
const PERSISTED_CACHE_PREFIX = "egi_api_cache_v1:";
const PERSISTED_CACHE_MAX_CHARS = 500_000;

/**
 * Short-lived GET cache. The memory layer removes duplicate requests during
 * route transitions; the per-tab session layer also lets a reload paint the
 * last response immediately. Both are cleared by every data mutation and the
 * memory layer is keyed by the current access token, so another user cannot
 * reuse a response in the same tab.
 */
export function clearApiCache() {
  cacheGeneration += 1;
  getCache.clear();
  getRequests.clear();
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PERSISTED_CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

function getCacheTtl(path: string) {
  if (path.startsWith("/dashboard")) return 15_000;
  if (path.includes("/screenshot")) return 30_000;
  if (
    path.startsWith("/projects/roster") ||
    path.startsWith("/projects/summary/scope") ||
    path.startsWith("/task-monitoring/filters")
  ) {
    return 60_000;
  }
  if (path.startsWith("/notifications")) return 5_000;
  return 8_000;
}

function canCacheGet(path: string, options: RequestOptions) {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" || options.cache === "no-store" || options.skipRefresh) return false;
  // Authentication and signed attachment endpoints have their own freshness
  // semantics and should always be fetched directly.
  if (path.startsWith("/auth/") || path.includes("/attachment")) return false;
  return true;
}

function persistedCacheKey(path: string, options: RequestOptions) {
  const scope = options.auth === false ? "public" : "private";
  return `${PERSISTED_CACHE_PREFIX}${scope}:${encodeURIComponent(path)}`;
}

function readPersistedCache(path: string, options: RequestOptions): GetCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(persistedCacheKey(path, options));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GetCacheEntry;
    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(persistedCacheKey(path, options));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedCache(
  path: string,
  options: RequestOptions,
  entry: GetCacheEntry,
) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > PERSISTED_CACHE_MAX_CHARS) return;
    window.sessionStorage.setItem(persistedCacheKey(path, options), serialized);
  } catch {
    // Quota and privacy restrictions must never block the API response.
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as LoginResponse;
    setTokens(data.access_token);
    setStoredUser(data.user);
    return true;
  } catch {
    return false;
  }
}

async function ensureRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function formatErrorMessage(body: ApiErrorBody | null, fallback: string) {
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(", ") : body.message;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const cacheable = canCacheGet(path, options);
  const cacheKey = cacheable
    ? `${options.auth === false ? "public" : getAccessToken() ?? "anonymous"}:${path}`
    : null;

  if (cacheKey) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) getCache.delete(cacheKey);

    const persisted = readPersistedCache(path, options);
    if (persisted) {
      getCache.set(cacheKey, persisted);
      return persisted.value as T;
    }

    const pending = getRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;
  } else if ((options.method ?? "GET").toUpperCase() !== "GET" && !path.startsWith("/auth/refresh")) {
    clearApiCache();
  }

  const request = apiFetchUncached<T>(path, options);
  if (!cacheKey) return request;

  const generation = cacheGeneration;
  const tracked = request
    .then((value) => {
      if (generation === cacheGeneration) {
        const entry = {
          expiresAt: Date.now() + getCacheTtl(path),
          value,
        } satisfies GetCacheEntry;
        getCache.set(cacheKey, entry);
        writePersistedCache(path, options, entry);
      }
      return value;
    })
    .finally(() => {
      if (getRequests.get(cacheKey) === tracked) getRequests.delete(cacheKey);
    });
  getRequests.set(cacheKey, tracked);
  return tracked;
}

async function apiFetchUncached<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, skipRefresh = false, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    reqHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAccessToken();
    if (token) reqHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers: reqHeaders,
    credentials: "include",
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401 && auth && !skipRefresh) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
    clearApiCache();
    clearAuthStorage();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const errBody = (parsed as ApiErrorBody) || null;
    throw new ApiError(
      res.status,
      formatErrorMessage(errBody, res.statusText || "Request failed"),
      errBody,
    );
  }

  return parsed as T;
}

export function getApiBaseUrl() {
  return API_URL;
}
