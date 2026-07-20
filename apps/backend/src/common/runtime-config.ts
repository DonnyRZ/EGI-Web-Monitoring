const UNSAFE_VALUES = new Set([
  "change_me_access_secret_min_32_chars",
  "change_me_refresh_secret_min_32_chars",
  "change_me_minio",
  "minioadmin",
]);

export function assertProductionRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const required = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const;
  for (const key of required) {
    const value = env[key]?.trim();
    if (!value || UNSAFE_VALUES.has(value)) {
      throw new Error(`${key} must be configured with a non-default secret in production`);
    }
  }
  if ((env.JWT_ACCESS_SECRET?.length ?? 0) < 32 || (env.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
    throw new Error("JWT secrets must be at least 32 characters in production");
  }
  if (!env.CORS_ORIGINS?.split(",").some((origin) => origin.trim())) {
    throw new Error("CORS_ORIGINS must list allowed frontend origins in production");
  }
  if (!env.DATABASE_URL?.trim() || env.DATABASE_URL.includes("change_me_postgres")) {
    throw new Error("DATABASE_URL must use non-default credentials in production");
  }
}

export function shouldEnableSwagger(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return env.ENABLE_SWAGGER !== "false";
  return env.ENABLE_SWAGGER === "true";
}
