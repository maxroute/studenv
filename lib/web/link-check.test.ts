import assert from "node:assert/strict";
import test from "node:test";
import { checkEndpoint, linkExists } from "./link-check";

test("only YouTube and Wikipedia addresses are checked, on their own public endpoints", () => {
  assert.equal(
    checkEndpoint("https://www.youtube.com/watch?v=wjI1WNcIntg"),
    "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DwjI1WNcIntg",
  );
  assert.equal(checkEndpoint("https://en.wikipedia.org/wiki/Stack_(abstract_data_type)"), "https://en.wikipedia.org/api/rest_v1/page/summary/Stack_(abstract_data_type)");
  assert.equal(checkEndpoint("https://bn.m.wikipedia.org/wiki/X"), "https://bn.wikipedia.org/api/rest_v1/page/summary/X");
  assert.equal(checkEndpoint("http://169.254.169.254/latest/meta-data"), null, "anything else is never fetched");
  assert.equal(checkEndpoint("https://example.com/a"), null);
  assert.equal(checkEndpoint("https://evil.wikipedia.org.attacker.net/wiki/X"), null);
});

test("a made-up video or article is dropped; other sites and failed checks are kept", async () => {
  const reply = (status: number) => async () => new Response("{}", { status });
  assert.equal(await linkExists("https://www.youtube.com/watch?v=madeup00000", reply(404)), false);
  assert.equal(await linkExists("https://www.youtube.com/watch?v=madeup00000", reply(400)), false);
  assert.equal(await linkExists("https://en.wikipedia.org/wiki/Not_a_real_page", reply(404)), false);
  assert.equal(await linkExists("https://www.youtube.com/watch?v=wjI1WNcIntg", reply(200)), true);
  assert.equal(await linkExists("https://example.com", reply(404)), true, "not checked");
  assert.equal(await linkExists("https://www.youtube.com/watch?v=x", async () => { throw new Error("offline"); }), true);
});
