const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
  }
}

export function validateRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Request body must be a JSON object.");
  }

  if (typeof input.customerId !== "string" || input.customerId.trim() === "") {
    throw new ValidationError("customerId is required.");
  }

  if (
    input.operation !== undefined &&
    !["lookup", "validate", "enrich"].includes(input.operation)
  ) {
    throw new ValidationError(
      "operation must be one of: lookup, validate, enrich.",
    );
  }

  return {
    customerId: input.customerId.trim(),
    operation: input.operation ?? "lookup",
    context:
      input.context && typeof input.context === "object" ? input.context : {},
  };
}

export function normalizeUpstreamResponse(payload, request) {
  return {
    customerId: request.customerId,
    operation: request.operation,
    outcome: payload?.eligible === false ? "review" : "continue",
    attributes: {
      segment: payload?.segment ?? "unknown",
      status: payload?.status ?? "unavailable",
    },
  };
}

export function buildIntegrationService({
  fetchImpl = globalThis.fetch,
  upstreamUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  if (!upstreamUrl) {
    throw new Error("upstreamUrl is required.");
  }

  return async function execute(input, correlationId) {
    const request = validateRequest(input);
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(upstreamUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          return normalizeUpstreamResponse(await response.json(), request);
        }

        if (response.status < 500 || attempt === maxAttempts) {
          throw new UpstreamError(
            `Upstream service returned HTTP ${response.status}.`,
          );
        }

        lastError = new UpstreamError(
          `Upstream service returned HTTP ${response.status}.`,
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }

        lastError =
          error instanceof UpstreamError
            ? error
            : new UpstreamError("Upstream service request failed.");
      }

      if (attempt < maxAttempts) {
        await sleep(100 * 2 ** (attempt - 1));
      }
    }

    throw lastError ?? new UpstreamError("Upstream service request failed.");
  };
}
