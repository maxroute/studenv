import assert from "node:assert/strict";
import test from "node:test";
import { finishNavigation, isInternalNavigationClick, onNavigationChange, startNavigation } from "./navigation-progress";

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const here = { origin: "https://studenv.app", pathname: "/shelf", search: "" };
const link = (href: string, extra: Partial<{ target: string; hasDownload: boolean }> = {}) => ({ href, target: "", hasDownload: false, ...extra });

test("a plain click on a link to another page of the app starts the bar", () => {
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/notes/n1"), here), true);
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/shelf?collection=c1"), here), true, "same page, other filter");
});

test("clicks that don't navigate here never start it", () => {
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/shelf"), here), false, "this page");
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/shelf#top"), here), false, "a jump within the page");
  assert.equal(isInternalNavigationClick(click, link("https://en.wikipedia.org/wiki/Paging"), here), false, "another site");
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/notes/n1", { target: "_blank" }), here), false, "a new tab");
  assert.equal(isInternalNavigationClick(click, link("https://studenv.app/file.pdf", { hasDownload: true }), here), false, "a download");
  assert.equal(isInternalNavigationClick({ ...click, metaKey: true }, link("https://studenv.app/notes/n1"), here), false, "cmd-click opens a tab");
  assert.equal(isInternalNavigationClick({ ...click, button: 1 }, link("https://studenv.app/notes/n1"), here), false, "middle click");
  assert.equal(isInternalNavigationClick({ ...click, defaultPrevented: true }, link("https://studenv.app/notes/n1"), here), false, "a handler took the click");
  assert.equal(isInternalNavigationClick(click, link("not a url"), here), false);
});

test("listeners hear the bar start and finish, once each", () => {
  const heard: boolean[] = [];
  const stop = onNavigationChange((active) => heard.push(active));
  startNavigation();
  startNavigation();
  finishNavigation();
  finishNavigation();
  stop();
  startNavigation();
  finishNavigation();
  assert.deepEqual(heard, [true, false]);
});
