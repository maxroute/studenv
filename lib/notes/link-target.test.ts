import { test } from "node:test";
import assert from "node:assert/strict";
import { linkTarget } from "./link-target";

test("web links open with their site's name", () => {
  assert.deepEqual(linkTarget({ href: "https://www.geeksforgeeks.org/array/" }), { kind: "web", url: "https://www.geeksforgeeks.org/array/", label: "geeksforgeeks.org" });
});

test("unsafe or broken addresses never open", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "not a url", 42, undefined]) assert.equal(linkTarget({ href }), null);
});

test("a link to a page in Studenv stays in the app", () => {
  assert.deepEqual(linkTarget({ href: "/notes/abc" }), { kind: "app", url: "/notes/abc", label: "Studenv" });
  assert.equal(linkTarget({ href: "//evil.example/x" }), null);
  const target = linkTarget({ href: null, ref: "note:abc123" });
  assert.equal(target?.kind, "app");
  assert.match(target?.url ?? "", /abc123/);
});
