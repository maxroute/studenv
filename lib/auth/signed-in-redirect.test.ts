import assert from "node:assert/strict";
import test from "node:test";
import { requestPathOf, safeLocalPath, signedInRedirect, signInPageFor } from "./signed-in-redirect";

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

test("signed out, the sign-in page returns you to the page you opened", () => {
  assert.equal(signInPageFor("/settings?section=privacy"), "/auth/signin?callbackUrl=%2Fsettings%3Fsection%3Dprivacy");
  assert.equal(signInPageFor("/notes/n1"), "/auth/signin?callbackUrl=%2Fnotes%2Fn1");
  assert.equal(signInPageFor(null), "/auth/signin?callbackUrl=%2Fdashboard");
  assert.equal(signInPageFor(undefined, "/auth/onboarding"), "/auth/signin?callbackUrl=%2Fauth%2Fonboarding");
  for (const bad of ["https://evil.example", "//evil.example", "/auth/signin", ""]) {
    assert.equal(signInPageFor(bad), "/auth/signin?callbackUrl=%2Fdashboard", JSON.stringify(bad));
  }
});

test("the request path keeps the query but not Next's internal _rsc marker", () => {
  assert.equal(requestPathOf("/settings", params("section=privacy&_rsc=abc")), "/settings?section=privacy");
  assert.equal(requestPathOf("/dashboard/planner", params("_rsc=1")), "/dashboard/planner");
  assert.equal(requestPathOf("/notes/n1", params()), "/notes/n1");
});
