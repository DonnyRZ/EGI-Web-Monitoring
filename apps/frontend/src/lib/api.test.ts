import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ApiError, apiFetch, clearApiCache } from "./api";

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  } satisfies Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem" | "clear">;
}

function installBrowserStorage() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const browserWindow = {
    localStorage,
    sessionStorage,
    location: { pathname: "/dashboard", href: "" },
    setTimeout,
    clearTimeout,
    addEventListener(type: string, listener: (event: Event) => void) {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener);
    },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });
  localStorage.setItem("egi_access_token", "expired-token");
  sessionStorage.setItem("egi_access_token", "expired-token");
  return browserWindow;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  installBrowserStorage();
  clearApiCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
});

test("GET retries one transient server failure", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ data: ["ok"] }), { status: 200 });
  };

  const response = await apiFetch<{ data: string[] }>("/test/retry");

  assert.deepEqual(response, { data: ["ok"] });
  assert.equal(attempts, 2);
});

test("concurrent expired requests share one refresh and retry", async () => {
  let refreshCalls = 0;
  const requestedPaths: string[] = [];
  const initialFailures = new Set<string>();
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedPaths.push(url);
    if (url.endsWith("/auth/refresh")) {
      refreshCalls += 1;
      return new Response(JSON.stringify({
        access_token: "fresh-token",
        user: { id: "user-1" },
      }), { status: 200 });
    }
    if (url.includes("/test/parallel")) {
      if (!initialFailures.has(url)) {
        initialFailures.add(url);
        return new Response("expired", { status: 401 });
      }
      return new Response(JSON.stringify({ data: url }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };

  const [first, second] = await Promise.all([
    apiFetch<{ data: string }>("/test/parallel/a"),
    apiFetch<{ data: string }>("/test/parallel/b"),
  ]);

  assert.equal(refreshCalls, 1);
  assert.match(first.data, /parallel\/a/);
  assert.match(second.data, /parallel\/b/);
});

test("a network failure during refresh keeps the session and returns recoverable error", async () => {
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/refresh")) throw new TypeError("offline");
    return new Response("expired", { status: 401 });
  };

  await assert.rejects(
    () => apiFetch("/test/network-refresh"),
    (error: unknown) => error instanceof ApiError && error.status === 503,
  );
  assert.equal(window.sessionStorage.getItem("egi_access_token"), "expired-token");
});
