const { test } = require("node:test");
const assert = require("node:assert/strict");
const rules = require("./shell-rules");

const origin = "https://studenv-online.vercel.app";
const screens = [{ x: 0, y: 0, width: 1440, height: 900 }];

test("only Studenv may use the microphone; any page may go full screen", () => {
  assert.equal(rules.mayUse("media", `${origin}/dashboard`, origin), true);
  assert.equal(rules.mayUse("media", "https://example.test/", origin), false);
  assert.equal(rules.mayUse("fullscreen", "https://www.youtube.com/", origin), true);
  assert.equal(rules.mayUse("geolocation", origin, origin), false);
});

test("the user agent names Studenv and no framework", () => {
  const ua = rules.userAgent(
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Studenv/1.0.0 Chrome/146.0.0.0 Electron/44.11.5 Safari/537.36",
    "1.0.0",
  );
  assert.equal(
    ua,
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 StudenvDesktop/1.0.0",
  );
});

test("a remembered window comes back only if it can be reached", () => {
  const saved = { x: 100, y: 80, width: 900, height: 700, maximized: false };
  assert.deepEqual(rules.windowBounds(saved, screens), saved);
  assert.equal(rules.windowBounds({ ...saved, x: 3000 }, screens).x, undefined);
  assert.equal(rules.windowBounds({ ...saved, width: 100 }, screens).width, 1280);
  assert.deepEqual(rules.windowBounds(null, [{ x: 0, y: 0, width: 1024, height: 700 }]), {
    width: 1024,
    height: 700,
    maximized: false,
  });
});
