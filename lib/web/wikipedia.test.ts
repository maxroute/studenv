import assert from "node:assert/strict";
import test from "node:test";
import { articleUrl, searchWikipedia, wikiLanguage, type FetchLike } from "./wikipedia";

function fakeWikipedia(pages: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url, init) => {
    calls.push(url);
    assert.match(init.headers["User-Agent"], /Studenv-Rangan/);
    const body = Object.entries(pages).find(([key]) => url.includes(key))?.[1];
    return { ok: body !== undefined, json: async () => body };
  };
}

const PAGES = {
  "search/page": { pages: [{ key: "Photosynthesis", title: "Photosynthesis", description: "Biological process" }, { key: "Photo_(disambiguation)", title: "Photo" }, { key: "Calvin_cycle", title: "Calvin cycle" }] },
  "summary/Photosynthesis": { type: "standard", title: "Photosynthesis", description: "Biological process", extract: "Photosynthesis  converts light\\ninto chemical energy." },
  "summary/Photo_(disambiguation)": { type: "disambiguation", title: "Photo", extract: "Photo may refer to:" },
  "summary/Calvin_cycle": { type: "standard", title: "Calvin cycle", extract: "The Calvin cycle fixes carbon." },
};

test("Bengali questions go to Bengali Wikipedia", () => {
  assert.equal(wikiLanguage("সালোকসংশ্লেষণ কী?"), "bn");
  assert.equal(wikiLanguage("What is photosynthesis?"), "en");
  assert.equal(wikiLanguage("ATP কী"), "en", "more Latin letters than Bengali");
});

test("article links are built here, on Wikipedia's own host", () => {
  assert.equal(articleUrl("en", "Calvin cycle"), "https://en.wikipedia.org/wiki/Calvin_cycle");
  assert.equal(articleUrl("bn", "সালোকসংশ্লেষণ"), `https://bn.wikipedia.org/wiki/${encodeURIComponent("সালোকসংশ্লেষণ")}`);
});

test("search returns summaries, skipping disambiguation pages, and caches the result", async () => {
  const calls: string[] = [];
  const articles = await searchWikipedia("Photosynthesis basics test", { fetch: fakeWikipedia(PAGES, calls), limit: 2, now: () => 1 });
  assert.deepEqual(
    articles.map((article) => [article.title, article.url, article.extract]),
    [
      ["Photosynthesis", "https://en.wikipedia.org/wiki/Photosynthesis", "Photosynthesis converts light\\ninto chemical energy."],
      ["Calvin cycle", "https://en.wikipedia.org/wiki/Calvin_cycle", "The Calvin cycle fixes carbon."],
    ],
  );
  assert.ok(calls[0].startsWith("https://en.wikipedia.org/w/rest.php/v1/search/page?q=Photosynthesis%20basics%20test"));
  const before = calls.length;
  await searchWikipedia("photosynthesis  basics test", { fetch: fakeWikipedia(PAGES, calls), limit: 2, now: () => 2 });
  assert.equal(calls.length, before, "the second search came from the cache");
});

test("a failed search throws, and an empty query asks nothing", async () => {
  await assert.rejects(searchWikipedia("unreachable topic", { fetch: fakeWikipedia({}) }));
  const calls: string[] = [];
  assert.deepEqual(await searchWikipedia("   ", { fetch: fakeWikipedia(PAGES, calls) }), []);
  assert.equal(calls.length, 0);
});
