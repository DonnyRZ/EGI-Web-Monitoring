import type { NextFunction, Request, Response } from "express";
import { createRequestId, type StructuredLogger } from "@egi/logging";

type RequestWithContext = Request & {
  requestId?: string;
  user?: { id?: string; role?: string };
};

export function requestLoggingMiddleware(logger: StructuredLogger) {
  return (request: RequestWithContext, response: Response, next: NextFunction) => {
    const requestId = createRequestId(request.headers["x-request-id"]);
    const startedAt = Date.now();
    request.requestId = requestId;
    response.setHeader("X-Request-ID", requestId);

    response.on("finish", () => {
      logger.log("http_request", undefined, {
        request_id: requestId,
        method: request.method,
        path: request.originalUrl.split("?")[0],
        status_code: response.statusCode,
        duration_ms: Date.now() - startedAt,
        user_id: request.user?.id ?? null,
        user_role: request.user?.role ?? null,
      });
    });

    next();
  };
}
