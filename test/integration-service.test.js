import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntegrationService,
  ValidationError,
  validateRequest,
} from "../src/integration-service.js";

test("validateRequest rejects missing customerId", () => {
  assert.throws(
    () => validateRequest({ operation: "lookup" }),
    ValidationError,
  );
});

test("service normalizes a successful upstream response", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers["x-correlation-id"], "correlation-123");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        eligible: true,
        segment: "preferred",
        status: "active",
      }),
    };
  };

  const execute = buildIntegrationService({
    fetchImpl,
    upstreamUrl: "https://upstream.example.com/customer",
  });

  const result = await execute(
    { customerId: "123", operation: "enrich" },
    "correlation-123",
  );

  assert.deepEqual(result, {
    customerId: "123",
    operation: "enrich",
    outcome: "continue",
    attributes: {
      segment: "preferred",
      status: "active",
    },
  });
});

test("service retries transient upstream failures", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 3) {
      return { ok: false, status: 503 };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ eligible: false }),
    };
  };

  const execute = buildIntegrationService({
    fetchImpl,
    upstreamUrl: "https://upstream.example.com/customer",
    maxAttempts: 3,
    sleep: async () => {},
  });

  const result = await execute({ customerId: "456" }, "correlation-456");

  assert.equal(attempts, 3);
  assert.equal(result.outcome, "review");
});
