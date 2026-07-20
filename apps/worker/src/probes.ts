import { chromium, type Browser } from "playwright";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { assertSafeProbeUrl } from "./target-safety";

export interface ProbeOptions {
  url: string;
  httpTimeoutMs: number;
  browserTimeoutMs: number;
}

export interface ProbeOutcome {
  httpOk: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  browserOk: boolean;
  renderTimeMs: number | null;
  screenshotOk: boolean;
  screenshotBuffer: Buffer | null;
  errorMessage: string | null;
  probeAborted?: boolean;
  /** A failure in Playwright/Chromium itself, rather than the monitored site. */
  infrastructureError?: string | null;
}

let sharedBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) {
    return sharedBrowser;
  }

  // A worker can process several jobs at once. Without a shared launch promise,
  // each job tries to spawn Chromium simultaneously and can crash the browser.
  if (!browserLaunchPromise) {
    browserLaunchPromise = launchBrowser()
      .then((browser) => {
        sharedBrowser = browser;
        browser.on("disconnected", () => {
          if (sharedBrowser === browser) sharedBrowser = null;
        });
        return browser;
      })
      .finally(() => {
        browserLaunchPromise = null;
      });
  }

  return browserLaunchPromise;
}

async function launchBrowser(): Promise<Browser> {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  const configuredExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const fallbackExecutable =
    configuredExecutable && existsSync(configuredExecutable)
      ? configuredExecutable
      : windowsChromiumFallback();

  try {
    // On some Windows installations the Playwright headless-shell binary is
    // rejected with EFTYPE, while the bundled full Chromium works normally.
    // Prefer the latter when it is present instead of burning retries first.
    return await chromium.launch(
      fallbackExecutable
        ? { ...launchOptions, executablePath: fallbackExecutable }
        : launchOptions,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Retain the retry in case the executable appears after the first launch
    // attempt (for example while Playwright installation is finishing).
    if (!message.includes("spawn EFTYPE") || !fallbackExecutable) throw error;
    return chromium.launch({ ...launchOptions, executablePath: fallbackExecutable });
  }
}

function windowsChromiumFallback(): string | null {
  if (process.platform !== "win32") return null;

  const headlessShell = chromium.executablePath();
  const revisionDirectory = dirname(dirname(headlessShell));
  const directoryName = basename(revisionDirectory);
  if (!directoryName.startsWith("chromium_headless_shell-")) return null;

  const chromiumDirectory = join(
    dirname(revisionDirectory),
    directoryName.replace("chromium_headless_shell-", "chromium-"),
  );
  const executable = join(chromiumDirectory, "chrome-win64", "chrome.exe");
  return existsSync(executable) ? executable : null;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => undefined);
    sharedBrowser = null;
  }
}

export async function runProbes(options: ProbeOptions): Promise<ProbeOutcome> {
  try {
    await assertSafeProbeUrl(options.url);
  } catch (error) {
    return {
      httpOk: false,
      httpStatus: null,
      responseTimeMs: null,
      browserOk: false,
      renderTimeMs: null,
      screenshotOk: false,
      screenshotBuffer: null,
      errorMessage: error instanceof Error ? error.message : "Invalid URL",
      probeAborted: true,
      infrastructureError: null,
    };
  }

  // These checks are independent. Running them together keeps a slow HTTP
  // response from adding its entire timeout to the browser capture time.
  const [http, browser] = await Promise.all([
    httpCheck(options.url, options.httpTimeoutMs),
    browserCheck(options.url, options.browserTimeoutMs),
  ]);

  const errors = [http.error, browser.error].filter(Boolean);
  return {
    httpOk: http.ok,
    httpStatus: http.status,
    responseTimeMs: http.responseTimeMs,
    browserOk: browser.ok,
    renderTimeMs: browser.renderTimeMs,
    screenshotOk: browser.screenshot != null,
    screenshotBuffer: browser.screenshot,
    errorMessage: errors.length ? errors.join("; ") : null,
    probeAborted: false,
    infrastructureError: browser.infrastructureError,
  };
}

async function httpCheck(
  url: string,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  status: number | null;
  responseTimeMs: number | null;
  error: string | null;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let target = url;
    let res: Response | undefined;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      await assertSafeProbeUrl(target);
      res = await fetch(target, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "EGI-Web-Monitoring/0.1" },
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      if (!location) break;
      if (redirects === 5) throw new Error("Too many HTTP redirects");
      target = new URL(location, target).toString();
    }
    const responseTimeMs = Date.now() - started;
    const ok = (res?.status ?? 0) >= 200 && (res?.status ?? 0) < 400;
    return {
      ok,
      status: res?.status ?? null,
      responseTimeMs,
      error: ok ? null : `HTTP ${res?.status ?? 0}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseTimeMs: Date.now() - started,
      error: error instanceof Error ? error.message : "HTTP check failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function browserCheck(
  url: string,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  renderTimeMs: number | null;
  screenshot: Buffer | null;
  error: string | null;
  infrastructureError: string | null;
}> {
  const started = Date.now();
  let context = null as Awaited<ReturnType<Browser["newContext"]>> | null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "EGI-Web-Monitoring/0.1 (Playwright)",
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      try {
        await assertSafeProbeUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    page.setDefaultTimeout(timeoutMs);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await waitForVisualStability(page, timeoutMs);
    const renderTimeMs = Date.now() - started;
    const status = response?.status() ?? 0;
    const ok = status >= 200 && status < 400;
    let screenshot: Buffer | null = null;
    try {
      screenshot = Buffer.from(
        await page.screenshot({
          // Chromium supports webp; Playwright typings may omit it
          type: "webp" as "png",
          fullPage: false,
        }),
      );
    } catch {
      try {
        screenshot = Buffer.from(
          await page.screenshot({ type: "png", fullPage: false }),
        );
      } catch {
        screenshot = null;
      }
    }
    return {
      ok,
      renderTimeMs,
      screenshot,
      error: ok ? null : `Browser HTTP ${status}`,
      infrastructureError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser check failed";
    return {
      ok: false,
      renderTimeMs: Date.now() - started,
      screenshot: null,
      error: message,
      infrastructureError: isBrowserInfrastructureError(message) ? message : null,
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

export function isBrowserInfrastructureError(message: string): boolean {
  return [
    "browserType.launch",
    "Target page, context or browser has been closed",
    "Executable doesn't exist",
    "Failed to launch the browser process",
  ].some((marker) => message.includes(marker));
}

type VisualPage = {
  waitForLoadState: (state: "networkidle", options: { timeout: number }) => Promise<void>;
  evaluate: (expression: string) => Promise<unknown>;
  waitForTimeout: (timeout: number) => Promise<void>;
};

/** Wait for document completion, web fonts, a bounded network idle window, and
 * a final settle period. Network idle is best-effort because analytics sockets
 * often keep pages busy forever. */
export async function waitForVisualStability(
  page: VisualPage,
  timeoutMs: number,
): Promise<void> {
  const settleMs = Math.min(1_500, Math.max(250, Math.floor(timeoutMs / 10)));
  await page.evaluate(`async () => {
    if (document.readyState !== "complete") {
      await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
    }
    await document.fonts?.ready;
  }`);
  await page.waitForLoadState("networkidle", { timeout: Math.min(5_000, timeoutMs) }).catch(() => undefined);
  await page.waitForTimeout(settleMs);
}
