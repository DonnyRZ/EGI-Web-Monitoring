import type IORedis from "ioredis";

const LOCK_PREFIX = "egi:website-lock:";
const LOCK_TTL_SEC = 120;

export async function acquireWebsiteLock(
  redis: IORedis,
  websiteId: string,
  token: string,
): Promise<boolean> {
  const result = await redis.set(
    `${LOCK_PREFIX}${websiteId}`,
    token,
    "EX",
    LOCK_TTL_SEC,
    "NX",
  );
  return result === "OK";
}

export async function releaseWebsiteLock(
  redis: IORedis,
  websiteId: string,
  token: string,
): Promise<void> {
  const key = `${LOCK_PREFIX}${websiteId}`;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, token);
}
