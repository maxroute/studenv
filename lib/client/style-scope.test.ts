import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A page's plain stylesheet stays loaded after the student leaves it. The Groups
// one once redefined the app's colours on :root and restyled shared class names,
// which turned the orange darker and shrank the Profile numbers everywhere.

/** Every selector in a stylesheet, one per comma-separated part, without keyframe steps. */
function selectors(path: string): string[] {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  const open: string[] = [];
  let text = "";
  for (const character of css) {
    if (character === "{") {
      const header = text.trim();
      if (!header.startsWith("@") && !open.some((outer) => outer.startsWith("@keyframes"))) {
        found.push(...header.split(/,(?![^(]*\))/).map((part) => part.trim().replace(/\s+/g, " ")));
      }
      open.push(header);
      text = "";
    } else if (character === "}") {
      open.pop();
      text = "";
    } else if (character === ";") text = "";
    else text += character;
  }
  return found;
}

const GROUPS = "app/(dashboard)/dashboard/groups/study-groups.css";

test("the Groups stylesheet sets nothing on the whole app", () => {
  const wide = selectors(GROUPS).filter((selector) => /^(:root|html|body|\*)(?![\w-])/.test(selector));
  assert.deepEqual(wide, []);
});

test("the Groups stylesheet never restyles an app-wide class outside Groups", () => {
  const appWide = new Set(selectors("app/globals.css").filter((selector) => /^\.[\w-]+$/.test(selector)));
  const leaks = selectors(GROUPS).filter((selector) => {
    const first = /^\.[\w-]+/.exec(selector)?.[0];
    return first !== undefined && appWide.has(first) && !/study-groups-page|room-page|study-room/.test(selector);
  });
  assert.deepEqual([...new Set(leaks)], []);
});
