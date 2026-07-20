import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadRequestException } from "@nestjs/common";

type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  return false;
}

/** Reject monitoring targets that could reach loopback, private networks, or
 * cloud metadata through the worker. DNS is resolved at write time and every
 * returned address must be public, so mixed DNS answers fail closed. */
export async function assertSafeMonitoringUrl(
  value: string,
  lookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
): Promise<void> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("Monitoring URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException("Monitoring URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new BadRequestException("Monitoring URL must not contain credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new BadRequestException("Monitoring URL must target a public host");
  }
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new BadRequestException("Monitoring URL must target a public IP");
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname);
  } catch {
    throw new BadRequestException("Monitoring host could not be resolved");
  }
  if (!records.length || records.some((record) => !isPublicIp(record.address))) {
    throw new BadRequestException("Monitoring URL must resolve only to public IP addresses");
  }
}
