import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarFile, imageExtension } from "./avatar";
import { sanitizeAvatarUrl } from "@/lib/security/sanitize";

const bytes = (...values: Array<number | string>) => new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((c) => c.charCodeAt(0)) : [value])));

test("the real image type comes from the bytes", () => {
  assert.equal(imageExtension(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpg");
  assert.equal(imageExtension(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), "png");
  assert.equal(imageExtension(bytes("RIFF", 0, 0, 0, 0, "WEBP")), "webp");
  assert.equal(imageExtension(bytes("GIF89a")), "gif");
  for (const other of [bytes("<svg onload=x>"), bytes("<!doctype html>"), bytes("%PDF-1.7"), bytes()]) assert.equal(imageExtension(other), null);
});

test("only a plain avatar file name is ever read from storage", () => {
  assert.deepEqual(avatarFile("cabc-1f2e.webp"), { key: "avatars/cabc-1f2e.webp", contentType: "image/webp" });
  for (const bad of ["../secret.png", "a/b.png", "..png", "a.svg", "a.png.exe", "a%2F.png", "", ".jpg"]) assert.equal(avatarFile(bad), null, bad);
});

test("a saved profile may keep its new or old photo address, and nothing like a path", () => {
  for (const ok of ["/avatars/cabc-1f2e.webp", "/uploads/avatars/cabc-1f2e.png", "https://example.com/me.png"]) assert.equal(sanitizeAvatarUrl(ok), ok);
  // A refused address is either rewritten into a web address or rejected with an error.
  const kept = (value: string) => {
    try {
      return sanitizeAvatarUrl(value) === value;
    } catch {
      return false;
    }
  };
  for (const bad of ["/avatars/../api/x.png", "/avatars/a/b.png", "/etc/passwd", "javascript:alert(1)"]) assert.equal(kept(bad), false, bad);
});
