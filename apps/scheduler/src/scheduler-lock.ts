import { randomUUID } from "node:crypto";
import type IORedis from "ioredis";

const LOCK_KEY = "egi:scheduler:tick-lock";
const LOCK_TTL_SECONDS = 55;

export async function acquireSchedulerLock(
  redis: IORedis,
): Promise<string | null> {
  const token = randomUUID();
  const acquired = await redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX");
  return acquired === "OK" ? token : null;
}

export async function releaseSchedulerLock(
  redis: IORedis,
  token: string,
): Promise<void> {
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    LOCK_KEY,
    token,
  );
}
