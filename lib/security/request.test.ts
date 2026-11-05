import assert from "node:assert/strict";
import test from "node:test";
import { getErrorResponse } from "./request";
import { ValidationHttpError } from "./validate";

test("database connection errors never expose provider details", (t) => {
  t.mock.method(console, "error", () => {});
  const result = getErrorResponse(
    Object.assign(
      new Error('Authentication failed for user "app_user" at ep-example.neon.tech'),
      { status: 503, code: "P1000" },
    ),
  );

  assert.equal(result.status, 503);
  assert.equal(result.message, "Something went wrong. Please try again shortly.");
  assert.equal(result.details, undefined);
});

test("unexpected server exceptions return a generic response", (t) => {
  t.mock.method(console, "error", () => {});
  const result = getErrorResponse(
    new Error("PrismaClientInitializationError: connection string contains credentials"),
  );

  assert.equal(result.status, 500);
  assert.equal(result.message, "Something went wrong. Please try again shortly.");
  assert.equal(result.details, undefined);
});

test("Next.js dynamic usage signals are not logged as application failures", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const result = getErrorResponse(
    Object.assign(new Error("Dynamic server usage: Route /api/assets used headers"), {
      digest: "DYNAMIC_SERVER_USAGE",
    }),
  );

  assert.equal(result.status, 500);
  assert.equal(result.message, "Something went wrong. Please try again shortly.");
  assert.equal(result.details, undefined);
  assert.equal(log.mock.callCount(), 0);
});

test("unknown server errors are still logged", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const error = new Error("Unexpected service failure");

  getErrorResponse(error);

  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[1], error);
});

test("known validation errors retain safe field-level feedback", () => {
  const result = getErrorResponse(
    new ValidationHttpError("Validation failed.", 400, {
      issues: [{ path: "email", message: "Enter a valid email address." }],
    }),
  );

  assert.equal(result.status, 400);
  assert.equal(result.message, "Validation failed.");
  assert.deepEqual(result.details, {
    issues: [{ path: "email", message: "Enter a valid email address." }],
  });
});

test("rate-limit responses expose only the retry timestamp", () => {
  const result = getErrorResponse(
    Object.assign(new Error("Too many requests."), {
      status: 429,
      details: { reset: 123456789, remaining: 0, secret: "must-not-leak" },
    }),
  );

  assert.equal(result.status, 429);
  assert.deepEqual(result.details, { reset: 123456789 });
});
