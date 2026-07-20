import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeMonitoringUrl } from "./monitoring-url";

const resolvesTo = (address: string) => async () => [{ address }];

test("allows public HTTP(S) targets", async () => {
  await assertSafeMonitoringUrl("https://monitor.example", resolvesTo("93.184.216.34"));
  await assertSafeMonitoringUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/", resolvesTo("93.184.216.34"));
});

test("rejects private, loopback, metadata, and credentialed targets", async () => {
  for (const value of [
    "http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254",
    "http://[::1]", "https://user:pass@example.com", "ftp://example.com",
  ]) {
    await assert.rejects(() => assertSafeMonitoringUrl(value, resolvesTo("93.184.216.34")));
  }
});

test("fails closed for private or mixed DNS answers", async () => {
  await assert.rejects(() => assertSafeMonitoringUrl("https://internal.example", resolvesTo("192.168.1.2")));
  await assert.rejects(() => assertSafeMonitoringUrl("https://mixed.example", async () => [
    { address: "93.184.216.34" }, { address: "10.0.0.7" },
  ]));
  await assert.rejects(() => assertSafeMonitoringUrl("https://missing.example", async () => { throw new Error("NXDOMAIN"); }));
});
