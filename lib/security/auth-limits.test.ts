import assert from "node:assert/strict";
import test from "node:test";
import { authIpBucket, retryMessage } from "./auth-limits";

test("each auth step has its own limit, and sign-in, sign-out and sessions use none", () => {
  assert.equal(authIpBucket("/api/auth/signup", "POST"), "signup");
  assert.equal(authIpBucket("/api/auth/verify-email", "POST"), "verify-email");
  assert.equal(authIpBucket("/api/auth/reset-password", "POST"), "reset-password");
  for (const path of ["/api/auth/callback/credentials", "/api/auth/signout", "/api/auth/_log", "/api/auth/session", "/api/auth/csrf"]) {
    assert.equal(authIpBucket(path, "POST"), null, path);
  }
  // Limited in their routes, per address and per email, so they are not counted twice.
  assert.equal(authIpBucket("/api/auth/resend-verification", "POST"), null);
  assert.equal(authIpBucket("/api/auth/forgot-password", "POST"), null);
  assert.equal(authIpBucket("/api/user/change-password", "POST"), null);
  assert.equal(authIpBucket("/api/auth/verify-email", "GET"), null, "a link preview is not an attempt");
});

test("the message says when to try again", () => {
  const now = 1_000_000;
  assert.equal(retryMessage(now + 12 * 60_000 - 5_000, now), "Too many attempts. Try again in 12 minutes.");
  assert.equal(retryMessage(now + 30_000, now), "Too many attempts. Try again in a minute.");
  assert.equal(retryMessage(now + 60 * 60_000, now, "requests"), "Too many requests. Try again in an hour.");
  assert.equal(retryMessage(now + 150 * 60_000, now), "Too many attempts. Try again in 3 hours.");
  assert.equal(retryMessage(now - 1, now), "Too many attempts. Please try again shortly.");
  assert.equal(retryMessage(Number.NaN, now), "Too many attempts. Please try again shortly.");
});
