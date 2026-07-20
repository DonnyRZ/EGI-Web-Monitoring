import type { LoggerService } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown>;

const SECRET_KEYS = new Set([
  "access_token",
  "authorization",
  "cookie",
  "password",
  "password_hash",
  "refresh_token",
  "refresh_token_hash",
  "secret",
  "s3_access_key",
  "s3_secret_key",
  "token",
  "x-api-key",
]);

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[- ]/g, "_");
  return SECRET_KEYS.has(normalized) || normalized.includes("password") || normalized.includes("token");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[MaxDepth]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isSecretKey(key) ? "[REDACTED]" : redact(item, depth + 1);
  }
  return output;
}

export function createRequestId(candidate?: unknown): string {
  if (typeof candidate === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export class StructuredLogger implements LoggerService {
  constructor(private readonly service: string) {}

  debug(message: unknown, context?: string, meta?: LogMeta): void {
    this.write("debug", message, context, meta);
  }

  log(message: unknown, context?: string, meta?: LogMeta): void {
    this.write("info", message, context, meta);
  }

  warn(message: unknown, context?: string, meta?: LogMeta): void {
    this.write("warn", message, context, meta);
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    const meta: LogMeta = {};
    if (stackOrContext?.includes("\n") || stackOrContext?.startsWith("Error")) {
      meta.stack = stackOrContext;
    }
    this.write("error", message, context ?? (meta.stack ? undefined : stackOrContext), meta);
  }

  write(level: LogLevel, message: unknown, context?: string, meta?: LogMeta): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message: typeof message === "string" ? message : String(message),
      ...(context ? { context } : {}),
      ...(redact(meta) as Record<string, unknown>),
    };
    const serialized = JSON.stringify(entry);
    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else console.log(serialized);
  }
}

export function createLogger(service: string): StructuredLogger {
  return new StructuredLogger(service);
}
