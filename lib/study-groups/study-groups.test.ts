import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fileResponseHeaders,
  groupFileDownloadUrl,
  groupFileUrl,
  parseByteRange,
} from "./file-delivery";
import { groupPhotoFile, groupPhotoName, groupPhotoUrl } from "./group-photo";
import {
  appendMessageOnce,
  isNearBottom,
  readClientMessageId,
  unsentMessages,
} from "./chat";

test("safe file types open in the tab, everything else downloads", () => {
  for (const type of ["application/pdf", "image/png", "image/jpeg", "video/mp4", "audio/mpeg", "text/plain"]) {
    const headers = fileResponseHeaders({ name: "a", mimeType: type, download: false });
    assert.equal(headers.inline, true, type);
    assert.equal(headers.contentType, type === "text/plain" ? "text/plain; charset=utf-8" : type);
    assert.match(headers.disposition, /^inline;/);
  }

  // Types a browser would run as a page on this app's origin never open inline.
  for (const type of ["text/html", "image/svg+xml", "application/xml", "text/javascript", "application/octet-stream", ""]) {
    const headers = fileResponseHeaders({ name: "a", mimeType: type, download: false });
    assert.equal(headers.inline, false, type);
    assert.equal(headers.contentType, "application/octet-stream", type);
    assert.match(headers.disposition, /^attachment;/);
  }
});

test("asking for a download always downloads", () => {
  const headers = fileResponseHeaders({ name: "notes.pdf", mimeType: "application/pdf", download: true });
  assert.equal(headers.inline, false);
  assert.match(headers.disposition, /^attachment; filename="notes.pdf"; filename\*=UTF-8''notes.pdf$/);
});

test("file names can't break the header and keep their Unicode form", () => {
  const headers = fileResponseHeaders({ name: 'a"b\\c/d\r\ne.pdf', mimeType: "application/pdf", download: true });
  assert.ok(!/[\r\n]/.test(headers.disposition));
  assert.match(headers.disposition, /filename="a_b_c_d__e.pdf"/);

  const bengali = fileResponseHeaders({ name: "নোট.pdf", mimeType: "application/pdf", download: true });
  assert.match(bengali.disposition, /filename="___.pdf"/);

  const quoteName = fileResponseHeaders({ name: "it's (1).pdf", mimeType: "application/pdf", download: true });
  assert.match(quoteName.disposition, /filename\*=UTF-8''it%27s%20%281%29.pdf$/);
  assert.match(bengali.disposition, new RegExp(`filename\\*=UTF-8''${encodeURIComponent("নোট.pdf")}`));

  assert.match(fileResponseHeaders({ name: "", mimeType: "text/plain", download: false }).disposition, /shared-file/);
});

test("byte ranges for video and PDF reading", () => {
  assert.deepEqual(parseByteRange(null, 100), { kind: "full" });
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { kind: "partial", start: 0, end: 9 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { kind: "partial", start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { kind: "partial", start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-500", 100), { kind: "partial", start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=50-5000", 100), { kind: "partial", start: 50, end: 99 });
  for (const bad of ["bytes=100-", "bytes=9-1", "bytes=-0", "bytes=-", "bytes=0-1,5-6", "items=0-1", "bytes=abc"]) {
    assert.deepEqual(parseByteRange(bad, 100), { kind: "unsatisfiable" }, bad);
  }
  assert.deepEqual(parseByteRange("bytes=0-1", 0), { kind: "unsatisfiable" });
});

test("chat file addresses stay on this app and never expire", () => {
  const url = groupFileUrl("cgroup1", "cfile1");
  assert.equal(url, "/group-files/cgroup1/cfile1");
  assert.equal(groupFileDownloadUrl(url), "/group-files/cgroup1/cfile1?download=1");
  assert.equal(groupFileDownloadUrl(`${url}?v=1`), "/group-files/cgroup1/cfile1?v=1&download=1");
});

test("a group photo name only ever reads that group's photo", () => {
  const name = groupPhotoName("cgroup1", "1f2e-3d4c", "webp");
  assert.equal(name, "cgroup1-1f2e-3d4c.webp");
  assert.deepEqual(groupPhotoFile("cgroup1", name), { key: `group-photos/${name}`, contentType: "image/webp" });
  assert.equal(groupPhotoUrl("cgroup1", name), `/group-photos/cgroup1/${name}`);
  assert.equal(groupPhotoUrl("cgroup1", null), null);

  // Another group's photo, folders, dots and other types are refused.
  for (const bad of ["cgroup2-1f2e.webp", "../cgroup1-1.png", "cgroup1-a/b.png", "cgroup1-a.svg", "cgroup1-.png", "cgroup1.png", "cgroup1-a.png.exe", ""]) {
    assert.equal(groupPhotoFile("cgroup1", bad), null, bad);
  }
});

test("the chat keeps following new messages only when the reader is at the end", () => {
  assert.equal(isNearBottom({ scrollTop: 880, clientHeight: 100, scrollHeight: 1000 }), true);
  assert.equal(isNearBottom({ scrollTop: 790, clientHeight: 100, scrollHeight: 1000 }), true);
  assert.equal(isNearBottom({ scrollTop: 200, clientHeight: 100, scrollHeight: 1000 }), false);
  // A list shorter than its box is always at the end.
  assert.equal(isNearBottom({ scrollTop: 0, clientHeight: 500, scrollHeight: 300 }), true);
});

test("a message that arrives twice (reply and socket) shows once", () => {
  const first = [{ id: "a" }];
  assert.equal(appendMessageOnce(first, { id: "a" }), first);
  assert.deepEqual(appendMessageOnce(first, { id: "b" }), [{ id: "a" }, { id: "b" }]);
});

test("a sending bubble goes away once the server's copy arrives", () => {
  const pending = [{ clientMessageId: "local-1aaaaaaa" }, { clientMessageId: "local-2bbbbbbb" }];
  assert.deepEqual(
    unsentMessages(pending, [{ clientMessageId: "local-1aaaaaaa" }, { clientMessageId: null }, {}]),
    [{ clientMessageId: "local-2bbbbbbb" }],
  );
  assert.equal(unsentMessages([], [{ clientMessageId: "x" }]).length, 0);
});

test("only a plain client message id is echoed back", () => {
  assert.equal(readClientMessageId("local-1a2b3c4d"), "local-1a2b3c4d");
  for (const bad of [undefined, null, 5, "", "short", "<script>alert(1)</script>", "a".repeat(65)]) {
    assert.equal(readClientMessageId(bad), null, String(bad));
  }
});
