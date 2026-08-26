import { assertSafeProbeUrl } from "./target-safety";

export interface ProbeOptions {
  url: string;
  httpTimeoutMs: number;
}

export interface ProbeOutcome {
  httpOk: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  probeAborted?: boolean;
  /** Reserved for failures in the monitoring pipeline, not the target site. */
  infrastructureFailure?: boolean;
}

export interface HttpHealthProbeOptions {
  url: string;
  timeoutMs: number;
}

export interface HttpHealthProbeResult {
  ok: boolean;
  status: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

/**
 * Run the production monitoring probe.
 *
 * This is intentionally HTTP-only. Live Website interaction is a user action
 * in the browser and is never performed by the background worker.
 */
export async function runProbes(options: ProbeOptions): Promise<ProbeOutcome> {
  try {
    await assertSafeProbeUrl(options.url);
  } catch (error) {
    return {
      httpOk: false,
      httpStatus: null,
      responseTimeMs: null,
      errorMessage: error instanceof Error ? error.message : "Invalid URL",
      probeAborted: true,
      infrastructureFailure: false,
    };
  }

  const http = await runHttpHealthProbe({
    url: options.url,
    timeoutMs: options.httpTimeoutMs,
  });

  return {
    httpOk: http.ok,
    httpStatus: http.status,
    responseTimeMs: http.responseTimeMs,
    errorMessage: http.error,
    probeAborted: false,
    infrastructureFailure: false,
  };
}

export async function runHttpHealthProbe(
  options: HttpHealthProbeOptions,
): Promise<HttpHealthProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let target = options.url;
    let response: Response | undefined;

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      await assertSafeProbeUrl(target);
      response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "EGI-Web-Monitoring/0.1" },
      });

      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      if (redirects === 5) throw new Error("Too many HTTP redirects");
      target = new URL(location, target).toString();
    }

    const responseTimeMs = Date.now() - started;
    const status = response?.status ?? 0;
    const ok = status >= 200 && status < 400;
    return {
      ok,
      status: response?.status ?? null,
      responseTimeMs,
      error: ok ? null : `HTTP ${status}`,
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
