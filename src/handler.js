import { randomUUID } from "node:crypto";
import {
  buildIntegrationService,
  UpstreamError,
  ValidationError,
} from "./integration-service.js";

function response(statusCode, body, correlationId) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event?.body) {
    return {};
  }

  return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
}

function log(level, message, fields = {}) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      service: process.env.SERVICE_NAME ?? "api-integration",
      stage: process.env.STAGE ?? "local",
      ...fields,
    }),
  );
}

export async function health(event = {}) {
  const correlationId =
    event.headers?.["x-correlation-id"] ??
    event.headers?.["X-Correlation-Id"] ??
    randomUUID();

  return response(
    200,
    {
      status: "ok",
      service: process.env.SERVICE_NAME ?? "api-integration",
      stage: process.env.STAGE ?? "local",
    },
    correlationId,
  );
}

export async function integrate(event = {}) {
  const correlationId =
    event.headers?.["x-correlation-id"] ??
    event.headers?.["X-Correlation-Id"] ??
    randomUUID();

  try {
    const input = parseBody(event);
    const execute = buildIntegrationService({
      upstreamUrl: process.env.UPSTREAM_API_URL,
      timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 3_000),
      maxAttempts: Number(process.env.UPSTREAM_MAX_ATTEMPTS ?? 3),
    });

    log("info", "Integration request received.", { correlationId });
    const result = await execute(input, correlationId);
    log("info", "Integration request completed.", {
      correlationId,
      outcome: result.outcome,
    });

    return response(200, { data: result }, correlationId);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ValidationError) {
      log("warn", "Integration request rejected.", {
        correlationId,
        error: error.message,
      });
      return response(
        400,
        { error: "invalid_request", message: error.message },
        correlationId,
      );
    }

    const statusCode = error instanceof UpstreamError ? error.statusCode : 500;
    log("error", "Integration request failed.", {
      correlationId,
      error: error.message,
    });

    return response(
      statusCode,
      {
        error: statusCode === 500 ? "internal_error" : "upstream_error",
        message:
          statusCode === 500
            ? "The request could not be completed."
            : error.message,
      },
      correlationId,
    );
  }
}
