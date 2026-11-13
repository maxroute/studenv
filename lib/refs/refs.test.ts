import test from "node:test";
import assert from "node:assert/strict";
import {
  REF_MAX_LENGTH,
  RefSchema,
  decodeRefPart,
  encodeRefPart,
  formatRef,
  parseRef,
} from "./ref-grammar";
import {
  RefTypeRegistry,
  assetRefType,
  classifyRef,
  getRefType,
  listRefTypes,
  noteRefType,
  workspaceRefType,
} from "./ref-types";
import { linkableRefTypes, refToUrl } from "./ref-links";

const canonical = (value: string) => {
  const ref = parseRef(value);
  return ref ? formatRef(ref) : null;
};

// ── grammar ────────────────────────────────────────────────────────────────

test("valid references parse into type, id and anchor", () => {
  assert.deepEqual(parseRef("asset:clp0abc123#page4"), { type: "asset", id: "clp0abc123", anchor: "page4" });
  assert.deepEqual(parseRef("note:clx9#b_2k8f0q1x7z"), { type: "note", id: "clx9", anchor: "b_2k8f0q1x7z" });
  assert.deepEqual(parseRef("item:cmwf8ojuj0003t20i21g2h3x6"), { type: "item", id: "cmwf8ojuj0003t20i21g2h3x6" });
  assert.deepEqual(parseRef("workspace:ws1#item-ab12cd34e"), { type: "workspace", id: "ws1", anchor: "item-ab12cd34e" });
  assert.deepEqual(parseRef("x-2:a.b~c_d-e#k=v:w,z"), { type: "x-2", id: "a.b~c_d-e", anchor: "k=v:w,z" });
});

test("strings outside the grammar are rejected", () => {
  const invalid = [
    "", "note", "note:", ":abc", "note:#b_1", "note:abc#", "Note:abc", "1note:abc", "-note:abc",
    "note:a/b", "note:a b", "note:a:b", "note:a#b#c", "note:a%2", "note:a%zz", "note:é",
    `${"a".repeat(33)}:id`, `note:${"a".repeat(129)}`, `note:a#${"a".repeat(257)}`,
  ];
  for (const value of invalid) assert.equal(parseRef(value), null, `rejects ${JSON.stringify(value)}`);
  for (const value of [null, undefined, 42, {}]) assert.equal(parseRef(value), null);
});

test("the grammar's length limits are inclusive", () => {
  assert.ok(parseRef(`${"a".repeat(32)}:id`));
  assert.ok(parseRef(`note:${"a".repeat(128)}`));
  assert.ok(parseRef(`note:a#${"a".repeat(256)}`));
});

test("a reference string longer than the stored column is rejected", () => {
  const id = "%2F".repeat(128); // 384 characters, valid for the id part
  assert.ok(parseRef(`item:${id}`));
  assert.equal(parseRef(`item:${id}#${"a".repeat(REF_MAX_LENGTH)}`), null);
  assert.equal(RefSchema.safeParse({ type: "item", id, anchor: "a".repeat(100) }).success, false);
  assert.equal(RefSchema.safeParse({ type: "item", id }).success, true);
});

// ── canonical form ─────────────────────────────────────────────────────────

test("two spellings of one reference canonicalise to the same string", () => {
  assert.equal(canonical("item:ab%2fc"), "item:ab%2Fc", "hex is uppercased");
  assert.equal(canonical("item:%41bc"), "item:Abc", "an escape for an allowed character is decoded");
  assert.equal(canonical("item:%41bc"), canonical("item:Abc"));
  assert.equal(canonical("item:a%3Ab"), "item:a%3Ab", "`:` stays escaped in an id");
  assert.equal(canonical("workspace:w#a%3ab"), "workspace:w#a:b", "`:` is allowed, so decoded, in an anchor");
  assert.equal(canonical("item:%c3%a9"), "item:%C3%A9");
});

test("formatting a parsed reference gives back the canonical string, and is stable", () => {
  for (const value of ["asset:clp0#page4", "asset:clp0#t=93500", "item:ab%2Fc", "lesson:abc#t=93500"]) {
    assert.equal(canonical(value), value);
    assert.equal(canonical(canonical(value) ?? ""), value);
  }
});

test("raw ids with reserved characters encode and decode losslessly", () => {
  for (const raw of ["a/b", "x:y#z", "café", "50% off", "plain-id_1.2~3"]) {
    const encoded = encodeRefPart(raw, "id");
    const ref = parseRef(`item:${encoded}`);
    assert.ok(ref, `encodes ${raw}`);
    assert.equal(ref.id, encoded, "the encoding is already canonical");
    assert.equal(decodeRefPart(ref.id), raw);
  }
  assert.equal(encodeRefPart("a:b", "anchor"), "a:b");
  assert.equal(decodeRefPart("%FF"), null, "invalid UTF-8 escapes do not decode");
});

// ── registry ───────────────────────────────────────────────────────────────

test("the registered reference types are exactly the v1 set", () => {
  // Removing or renaming a type breaks stored references; change this list only on purpose.
  assert.deepEqual(listRefTypes(), ["asset", "item", "note", "workspace"]);
});

test("an unknown type is a valid reference and round-trips unchanged", () => {
  const value = "lesson:abc#t=93500";
  const ref = parseRef(value);
  assert.ok(ref);
  assert.deepEqual(classifyRef(ref), { known: false, ref });
  assert.equal(formatRef(ref), value);
  assert.equal(refToUrl(ref), null);
});

test("asset anchors: pages are 1-based, times are integer milliseconds", () => {
  const anchorOf = (value: string) => {
    const ref = parseRef(value);
    assert.ok(ref);
    const classified = classifyRef(ref);
    assert.equal(classified.known, true);
    return classified.known ? classified.anchor : undefined;
  };
  assert.deepEqual(anchorOf("asset:a#page4"), { kind: "page", page: 4 });
  assert.deepEqual(anchorOf("asset:a#t=93500"), { kind: "time", ms: 93500 });
  assert.deepEqual(anchorOf("asset:a#t=0"), { kind: "time", ms: 0 });
  assert.equal(anchorOf("asset:a"), null, "no anchor points at the whole asset");
  for (const anchor of ["page0", "page04", "t=01", "t=1.5", "t=-1", "p4", "t=93s"]) {
    assert.equal(anchorOf(`asset:a#${anchor}`), null, `${anchor} is not understood`);
  }
  assert.equal(assetRefType.formatAnchor?.({ kind: "page", page: 4 }), "page4");
  assert.equal(assetRefType.formatAnchor?.({ kind: "time", ms: 93500 }), "t=93500");
  assert.throws(() => assetRefType.formatAnchor?.({ kind: "page", page: 0 }), RangeError);
  assert.throws(() => assetRefType.formatAnchor?.({ kind: "time", ms: 1.5 }), RangeError);
});

test("an anchor form this build does not understand is kept on the reference", () => {
  const ref = parseRef("asset:a#region=1,2,3,4");
  assert.ok(ref);
  const classified = classifyRef(ref);
  assert.equal(classified.known && classified.anchor, null, "falls back to the whole target");
  assert.equal(formatRef(classified.ref), "asset:a#region=1,2,3,4");
});

test("note anchors are block ids", () => {
  const ref = parseRef("note:n1#b_8f2kq0x1zt");
  assert.ok(ref);
  const classified = classifyRef(ref);
  assert.deepEqual(classified.known && classified.anchor, { blockId: "b_8f2kq0x1zt" });
  const short = parseRef("note:n1#b_123");
  assert.ok(short);
  const classifiedShort = classifyRef(short);
  assert.equal(classifiedShort.known && classifiedShort.anchor, null, "an id of the wrong length is not a block");
  assert.throws(() => noteRefType.formatAnchor?.({ blockId: "nope" }), RangeError);
});

test("workspace anchors carry a node id, encoded when needed", () => {
  const anchor = workspaceRefType.formatAnchor?.({ nodeId: "node/with space" });
  assert.equal(anchor, "node%2Fwith%20space");
  const ref = parseRef(`workspace:w1#${anchor}`);
  assert.ok(ref);
  const classified = classifyRef(ref);
  assert.deepEqual(classified.known && classified.anchor, { nodeId: "node/with space" });
});

test("a type is registered once, and aliases resolve to it", () => {
  const registry = new RefTypeRegistry();
  registry.define({ type: "clip", label: "Clip", aliases: ["snippet"] });
  assert.equal(registry.get("snippet")?.type, "clip");
  assert.deepEqual(registry.list(), ["clip"]);
  assert.throws(() => registry.define({ type: "clip", label: "Again" }), /already registered/);
  assert.throws(() => registry.define({ type: "other", label: "Other", aliases: ["snippet"] }), /already registered/);
  assert.throws(() => registry.define({ type: "Bad", label: "Bad" }), /Invalid reference type name/);
  assert.throws(() => registry.define({ type: "dup", label: "Dup", aliases: ["dup"] }), /repeats a name/);

  const ref = parseRef("snippet:abc");
  assert.ok(ref);
  const classified = registry.classify(ref);
  assert.equal(classified.known, true);
  assert.equal(formatRef(classified.ref), "snippet:abc", "the stored string is never rewritten");
});

test("the shared registry is not changed by other registries", () => {
  assert.equal(getRefType("clip"), undefined);
});

// ── links ──────────────────────────────────────────────────────────────────

test("references link only to pages that exist", () => {
  const url = (value: string) => {
    const ref = parseRef(value);
    assert.ok(ref);
    return refToUrl(ref);
  };
  assert.deepEqual(linkableRefTypes(), ["item", "workspace"]);
  assert.equal(url("item:cmwf8ojuj0003t20i21g2h3x6"), "/shelf/cmwf8ojuj0003t20i21g2h3x6");
  assert.equal(url("workspace:ws1"), "/workspaces/ws1");
  assert.equal(url("workspace:ws1#item-ab12"), "/workspaces/ws1?focus=item-ab12");
  assert.equal(url("workspace:ws1#a%26b"), "/workspaces/ws1?focus=a%26b", "the node id is encoded for the query");
  assert.equal(url("note:n1#b_8f2kq0x1zt"), null, "no notes page yet");
  assert.equal(url("asset:a#page4"), null, "no asset viewer route with page or time yet");
  assert.equal(url("item:.."), null, "dot segments never become paths");
  assert.equal(url("item:a%2Fb"), "/shelf/a%2Fb", "escapes stay escaped in the path");
});
