import assert from "node:assert/strict";
import test from "node:test";
import { safeLocalPath, signedInRedirect } from "./signed-in-redirect";

const params = (query = "") => new URLSearchParams(query);

test("signed in, the home page opens the dashboard and the sign-in pages go where they were sending you", () => {
  assert.equal(signedInRedirect("/", params()), "/dashboard");
  assert.equal(signedInRedirect("/auth/signin", params()), "/dashboard");
  assert.equal(signedInRedirect("/auth/signup", params()), "/dashboard");
  assert.equal(signedInRedirect("/auth/signin", params("callbackUrl=%2Fnotes%2Fn1%3Ftab%3D2")), "/notes/n1?tab=2");
});

test("other pages are shown as they are", () => {
  for (const path of ["/dashboard", "/faq", "/privacy", "/auth/verify-email", "/auth/reset-password", "/auth/onboarding", "/auth/forgot-password"]) {
    assert.equal(signedInRedirect(path, params()), null, path);
  }
});

test("a callback can't send you to another site or back into sign-in", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/ok\\..", "javascript:alert(1)", "/auth/signin", "/auth/signup?x=1", "/", "/a\u0000b", ""]) {
    assert.equal(safeLocalPath(bad), null, JSON.stringify(bad));
    assert.equal(signedInRedirect("/auth/signin", params(`callbackUrl=${encodeURIComponent(bad)}`)), "/dashboard");
  }
  assert.equal(safeLocalPath("/workspaces/w1#node"), "/workspaces/w1#node");
});
