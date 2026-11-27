import { test } from "node:test";
import assert from "node:assert/strict";
import { previewFor } from "./youtube-preview";

test("a video link or plain address gets a thumbnail and a player", () => {
  const fromLink = previewFor(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"], "Watch this");
  assert.equal(fromLink?.thumbnail, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.match(fromLink?.embed ?? "", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  const fromText = previewFor([], "Lecture: https://youtu.be/dQw4w9WgXcQ for revision");
  assert.equal(fromText?.key, fromLink?.key);
});

test("a playlist has a player but no single thumbnail", () => {
  const preview = previewFor([], "YouTube – DSA playlist: https://www.youtube.com/playlist?list=PLDN4rrl48XKpZkf03iYFl-O29szjTrs_O");
  assert.ok(preview?.playlist);
  assert.equal(preview?.thumbnail, null);
  assert.match(preview?.embed ?? "", /list=PLDN4rrl48XKpZkf03iYFl-O29szjTrs_O/);
});

test("other sites and broken addresses get nothing", () => {
  assert.equal(previewFor(["https://leetcode.com/tag/array/"], "LeetCode https://www.geeksforgeeks.org/x/"), null);
  assert.equal(previewFor([], "youtube.com is a site"), null);
  assert.equal(previewFor(["javascript:alert(1)"], ""), null);
});

test("only bare addresses are hidden: written-out ones and links that show their address", async () => {
  const { Schema } = await import("@tiptap/pm/model");
  const schema = new Schema({
    nodes: { doc: { content: "block+" }, paragraph: { group: "block", content: "text*" }, text: {} },
    marks: { link: { attrs: { href: {} } } },
  });
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const link = (text: string) => schema.text(text, [schema.marks.link.create({ href: url })]);
  const line = schema.nodes.paragraph.create(null, [schema.text("Watch: "), schema.text(url), schema.text(" or "), link("this lecture"), schema.text(" "), link(url)]);
  const { bareAddresses } = await import("./youtube-preview");
  const ranges = bareAddresses(line, 1);
  assert.deepEqual(ranges.map(({ from, to }) => line.textBetween(from - 1, to - 1)), [url, url]);
});
