import {
  clearAuthStorage,
  getSharedAccessToken,
  getAccessToken,
  syncAuthFromSharedStorage,
  setTokens,
  setStoredUser,
  ACCESS_TOKEN_STORAGE_KEY,
} from "./auth-storage";
import type { ApiErrorBody, LoginResponse } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3001/api";

const REQUEST_TIMEOUT_MS = 10_000;
const GET_RETRY_DELAY_MS = 180;
const MAX_GET_ATTEMPTS = 2;
const STALE_CACHE_GRACE_MS = 60_000;
const REFRESH_WAIT_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 1_500;
const REFRESH_LOCK_NAME = "egi-auth-refresh";
const REFRESH_LEASE_KEY = "egi_auth_refresh_lock";
const REFRESH_EVENT_KEY = "egi_auth_refresh_event";
const REFRESH_CHANNEL_NAME = "egi-auth-refresh";

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

type RefreshOutcome =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "network" };

type RefreshMessage =
  | { type: "success"; at: number }
  | { type: "failure"; at: number; reason: "unauthorized" | "network" };

let refreshPromise: Promise<RefreshOutcome> | null = null;
let refreshChannel: BroadcastChannel | null | undefined;
const refreshOwnerId =
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type GetCacheEntry = {
  expiresAt: number;
  staleUntil?: number;
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

function readPersistedCache(
  path: string,
  options: RequestOptions,
  allowStale = false,
): GetCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(persistedCacheKey(path, options));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GetCacheEntry;
    if (!parsed || typeof parsed.expiresAt !== "number") {
      window.sessionStorage.removeItem(persistedCacheKey(path, options));
      return null;
    }
    const staleUntil = parsed.staleUntil ?? parsed.expiresAt + STALE_CACHE_GRACE_MS;
    if (parsed.expiresAt <= Date.now() && (!allowStale || staleUntil <= Date.now())) {
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

function isTransientError(error: unknown) {
  return error instanceof ApiError &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500);
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
}

function getRefreshChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (refreshChannel !== undefined) return refreshChannel;
  try {
    refreshChannel = new BroadcastChannel(REFRESH_CHANNEL_NAME);
  } catch {
    refreshChannel = null;
  }
  return refreshChannel;
}

function publishRefreshMessage(message: RefreshMessage) {
  getRefreshChannel()?.postMessage(message);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFRESH_EVENT_KEY, JSON.stringify(message));
  } catch {
    // The BroadcastChannel is still useful when storage is unavailable.
  }
}

function outcomeFromMessage(message: RefreshMessage): RefreshOutcome {
  if (message.type === "success") {
    syncAuthFromSharedStorage();
    return { ok: true };
  }
  return { ok: false, reason: message.reason };
}

function waitForSharedRefresh(initialToken: string | null): Promise<RefreshOutcome> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "network" });
  }

  const sharedToken = getSharedAccessToken();
  if (sharedToken && sharedToken !== initialToken && syncAuthFromSharedStorage()) {
    return Promise.resolve({ ok: true });
  }

  const startedAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => finish({ ok: false, reason: "network" }), REFRESH_WAIT_TIMEOUT_MS);
    const channel = getRefreshChannel();

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
    };

    const finish = (outcome: RefreshOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };

    const onMessage = (event: MessageEvent<RefreshMessage>) => {
      if (event.data?.type === "success") {
        finish(outcomeFromMessage(event.data));
      } else if (event.data?.type === "failure") {
        finish(outcomeFromMessage(event.data));
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCESS_TOKEN_STORAGE_KEY && event.newValue && event.newValue !== initialToken) {
        if (syncAuthFromSharedStorage()) finish({ ok: true });
        return;
      }
      if (event.key !== REFRESH_EVENT_KEY || !event.newValue) return;
      try {
        const message = JSON.parse(event.newValue) as RefreshMessage;
        if (message.type === "success" || message.type === "failure") {
          finish(outcomeFromMessage(message));
        }
      } catch {
        // Ignore malformed cross-tab coordination values.
      }
    };

    window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);

    const latestToken = getSharedAccessToken();
    if (latestToken && latestToken !== initialToken && syncAuthFromSharedStorage()) {
      finish({ ok: true });
      return;
    }
    try {
      const rawEvent = window.localStorage.getItem(REFRESH_EVENT_KEY);
      if (rawEvent) {
        const message = JSON.parse(rawEvent) as RefreshMessage;
        if ((message.type === "success" || message.type === "failure") && message.at >= startedAt) {
          finish(outcomeFromMessage(message));
        }
      }
    } catch {
      // Ignore malformed or unavailable coordination state.
    }
  });
}

function tryAcquireRefreshLease() {
  if (typeof window === "undefined") return true;
  try {
    const now = Date.now();
    const current = window.localStorage.getItem(REFRESH_LEASE_KEY);
    if (current) {
      const parsed = JSON.parse(current) as { owner?: string; expiresAt?: number };
      if (parsed.owner && typeof parsed.expiresAt === "number" && parsed.expiresAt > now) return false;
    }
    const lease = JSON.stringify({ owner: refreshOwnerId, expiresAt: now + REFRESH_WAIT_TIMEOUT_MS });
    window.localStorage.setItem(REFRESH_LEASE_KEY, lease);
    return window.localStorage.getItem(REFRESH_LEASE_KEY) === lease;
  } catch {
    // If storage is unavailable, this tab can still make a safe single-flight request.
    return true;
  }
}

function releaseRefreshLease() {
  if (typeof window === "undefined") return;
  try {
    const current = window.localStorage.getItem(REFRESH_LEASE_KEY);
    if (!current) return;
    const parsed = JSON.parse(current) as { owner?: string };
    if (parsed.owner === refreshOwnerId) window.localStorage.removeItem(REFRESH_LEASE_KEY);
  } catch {
    // Lease expiry is the fallback when storage becomes unavailable.
  }
}

async function refreshAccessToken(): Promise<RefreshOutcome> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const outcome: RefreshOutcome = { ok: false, reason: res.status === 401 ? "unauthorized" : "network" };
      publishRefreshMessage({ type: "failure", at: Date.now(), reason: outcome.reason });
      return outcome;
    }
    const data = (await res.json()) as LoginResponse;
    setTokens(data.access_token);
    setStoredUser(data.user);
    publishRefreshMessage({ type: "success", at: Date.now() });
    return { ok: true };
  } catch {
    const outcome: RefreshOutcome = { ok: false, reason: "network" };
    publishRefreshMessage({ type: "failure", at: Date.now(), reason: outcome.reason });
    return outcome;
  }
}

async function coordinateRefresh(): Promise<RefreshOutcome> {
  const initialToken = getAccessToken();
  if (typeof window === "undefined") return refreshAccessToken();

  const sharedToken = getSharedAccessToken();
  if (sharedToken && sharedToken !== initialToken && syncAuthFromSharedStorage()) {
    return { ok: true };
  }

  const lockManager = (navigator as Navigator & {
    locks?: {
      request<T>(
        name: string,
        options: { ifAvailable: boolean },
        callback: (lock: Lock | null) => Promise<T>,
      ): Promise<T>;
    };
  }).locks;

  if (lockManager) {
    try {
      const result = await lockManager.request(REFRESH_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return null;
        return refreshAccessToken();
      });
      if (result) return result;
      return waitForSharedRefresh(initialToken);
    } catch {
      // Fall through to the localStorage lease for browsers with partial Locks API support.
    }
  }

  if (tryAcquireRefreshLease()) {
    try {
      return await refreshAccessToken();
    } finally {
      releaseRefreshLease();
    }
  }
  return waitForSharedRefresh(initialToken);
}

async function ensureRefresh(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = coordinateRefresh().finally(() => {
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
  let staleCache: GetCacheEntry | null = null;

  if (cacheKey) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    staleCache = cached && cached.staleUntil && cached.staleUntil > Date.now()
      ? cached
      : readPersistedCache(path, options, true);
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
          staleUntil: Date.now() + getCacheTtl(path) + STALE_CACHE_GRACE_MS,
          value,
        } satisfies GetCacheEntry;
        getCache.set(cacheKey, entry);
        writePersistedCache(path, options, entry);
      }
      return value;
    })
    .catch((error: unknown) => {
      if (staleCache && isTransientError(error)) return staleCache.value as T;
      throw error;
    })
    .finally(() => {
      if (getRequests.get(cacheKey) === tracked) getRequests.delete(cacheKey);
    });
  getRequests.set(cacheKey, tracked);
  return tracked;
}

function shouldRetryGet(method: string, path: string) {
  return (method === "GET" || method === "HEAD") && !path.startsWith("/auth/refresh");
}

function shouldRetryResponse(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  method: string,
  path: string,
) {
  const retryable = shouldRetryGet(method, path);
  for (let attempt = 0; attempt < (retryable ? MAX_GET_ATTEMPTS : 1); attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (retryable && attempt + 1 < MAX_GET_ATTEMPTS && shouldRetryResponse(response.status)) {
        await response.body?.cancel();
        await wait(GET_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      if (!retryable || attempt + 1 >= MAX_GET_ATTEMPTS) {
        throw new ApiError(
          0,
          error instanceof DOMException && error.name === "TimeoutError"
            ? "Server terlalu lama merespons. Coba lagi."
            : "Koneksi ke server terputus. Coba lagi.",
        );
      }
      await wait(GET_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw new ApiError(0, "Koneksi ke server terputus. Coba lagi.");
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

  const method = (rest.method ?? "GET").toUpperCase();
  const res = await fetchWithRetry(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers: reqHeaders,
    credentials: "include",
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  }, method, path);

  if (res.status === 401 && auth && !skipRefresh) {
    const tokenBeforeRefresh = getAccessToken();
    const refreshed = await ensureRefresh();
    if (refreshed.ok) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
    const sharedToken = getSharedAccessToken();
    if (sharedToken && sharedToken !== tokenBeforeRefresh && syncAuthFromSharedStorage()) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
    if (refreshed.reason === "network") {
      throw new ApiError(503, "Sesi belum dapat dipulihkan karena koneksi sedang bermasalah. Coba lagi.");
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
