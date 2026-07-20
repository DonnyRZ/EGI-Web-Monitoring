import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = -1, b = -1] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168."));
  }
  return false;
}

/** Validates every target the worker is about to fetch, including redirects.
 * This is intentionally duplicated from the API boundary so a previously
 * stored record or redirect cannot turn the worker into an SSRF proxy. */
export async function assertSafeProbeUrl(
  value: string,
  lookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Probe URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Probe URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) throw new Error("Probe URL must not contain credentials");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Probe URL must target a public host");
  }
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("Probe URL must target a public IP");
    return url;
  }

  const records = await lookup(hostname).catch(() => {
    throw new Error("Probe host could not be resolved");
  });
  if (!records.length || records.some((record) => !isPublicIp(record.address))) {
    throw new Error("Probe URL must resolve only to public IP addresses");
  }
  return url;
}
