import { chromium, type Browser } from "playwright";

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
}

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => undefined);
    sharedBrowser = null;
  }
}

export async function runProbes(options: ProbeOptions): Promise<ProbeOutcome> {
  let url: URL;
  try {
    url = new URL(options.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("URL must be http or https");
    }
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
    };
  }

  const http = await httpCheck(url.toString(), options.httpTimeoutMs);
  const browser = await browserCheck(url.toString(), options.browserTimeoutMs);

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
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "EGI-Web-Monitoring/0.1" },
    });
    const responseTimeMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 400;
    return {
      ok,
      status: res.status,
      responseTimeMs,
      error: ok ? null : `HTTP ${res.status}`,
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
    page.setDefaultTimeout(timeoutMs);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
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
    };
  } catch (error) {
    return {
      ok: false,
      renderTimeMs: Date.now() - started,
      screenshot: null,
      error: error instanceof Error ? error.message : "Browser check failed",
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}
