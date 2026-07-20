import assert from "node:assert/strict";
import test from "node:test";
import { acquireSchedulerLock, releaseSchedulerLock } from "./scheduler-lock";

class FakeRedis {
  private value: string | null = null;

  async set(_key: string, value: string, _mode: string, _ttl: number, nx: string) {
    if (nx !== "NX" || this.value) return null;
    this.value = value;
    return "OK";
  }

  async eval(_script: string, _keys: number, _key: string, token: string) {
    if (this.value !== token) return 0;
    this.value = null;
    return 1;
  }
}

test("only one scheduler contender acquires the distributed lock", async () => {
  const redis = new FakeRedis();
  const first = await acquireSchedulerLock(redis as never);
  const second = await acquireSchedulerLock(redis as never);

  assert.ok(first);
  assert.equal(second, null);

  await releaseSchedulerLock(redis as never, first);
  assert.ok(await acquireSchedulerLock(redis as never));
});
