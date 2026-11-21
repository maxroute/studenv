import assert from "node:assert/strict";
import test from "node:test";
import { authorName, commonsFileName, findCommonsImage, isCommonsFilePage, isCommonsImageUrl, isWikipediaArticleUrl, plainCredit, withoutQuery } from "./wikimedia-images";
import type { FetchLike } from "./wikipedia";

const COMMONS_THUMB = "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Virtual_memory.svg/330px-Virtual_memory.svg.png";
const LOCAL_THUMB = "https://thumb.wikimedia.org/wikipedia/en/thumb/5/5f/Windows_logo.svg/320px-Windows_logo.svg.png";

test("only Commons pictures and pages, and Wikipedia articles, are accepted", () => {
  assert.equal(isCommonsImageUrl(COMMONS_THUMB), true);
  assert.equal(isCommonsImageUrl("https://upload.wikimedia.org/wikipedia/commons/3/32/Virtual_memory.svg"), true);
  assert.equal(isCommonsImageUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Virtual_memory.svg/330px-Virtual_memory.svg.png"), true);
  assert.equal(isCommonsImageUrl(LOCAL_THUMB), false, "Wikipedia's own files may be fair use");
  assert.equal(isCommonsImageUrl("http://upload.wikimedia.org/wikipedia/commons/3/32/X.png"), false);
  assert.equal(isCommonsImageUrl("https://upload.wikimedia.org.evil.com/wikipedia/commons/3/32/X.png"), false);
  assert.equal(isCommonsImageUrl("https://upload.wikimedia.org/wikipedia/commons/3/32/X.png?x=1"), false);
  assert.equal(isCommonsImageUrl("javascript:alert(1)"), false);
  assert.equal(isCommonsFilePage("https://commons.wikimedia.org/wiki/File:X.png"), true);
  assert.equal(isCommonsFilePage("https://commons.wikimedia.org/wiki/Main_Page"), false);
  assert.equal(isWikipediaArticleUrl("https://en.wikipedia.org/wiki/Paging"), true);
  assert.equal(isWikipediaArticleUrl("https://bn.wikipedia.org/wiki/%E0%A6%95"), true);
  assert.equal(isWikipediaArticleUrl("https://de.wikipedia.org/wiki/Paging"), false);
  assert.equal(isWikipediaArticleUrl("https://en.wikipedia.org/wiki/Special:Random"), false);
  assert.equal(isWikipediaArticleUrl("https://example.com/wiki/Paging"), false);
});

test("file names, thumbnail sizes and credits are read from Commons' formats", () => {
  assert.equal(commonsFileName(COMMONS_THUMB), "Virtual_memory.svg");
  assert.equal(commonsFileName("https://upload.wikimedia.org/wikipedia/commons/a/ab/Caf%C3%A9.jpg"), "Café.jpg");
  assert.equal(commonsFileName(LOCAL_THUMB), null);
  assert.equal(withoutQuery(`${COMMONS_THUMB}?utm_source=en.wikipedia.org&utm_campaign=api`), COMMONS_THUMB);
  assert.equal(withoutQuery("not a url"), null);
  assert.equal(plainCredit('<a href="//commons.wikimedia.org/wiki/User:Ehamberg">Ehamberg</a> &amp; others'), "Ehamberg & others");
  assert.equal(plainCredit("x".repeat(100), 10).length, 10);
  assert.equal(
    authorName('<span>The <a href="https://validator.w3.org">SVG code</a> is valid.</span> This diagram was created with Dia by <a href="//commons.wikimedia.org/wiki/User:VolodyA!_V_Anarhist">VolodyA! V Anarhist</a>'),
    "VolodyA! V Anarhist",
    "the linked user, not the badge",
  );
  assert.equal(authorName("Jane Doe"), "Jane Doe");
});

function fakeFetch(options: { thumb?: string; licence?: string; nonFree?: boolean; type?: string; fail?: boolean } = {}) {
  const asked: string[] = [];
  const fetcher: FetchLike = async (url) => {
    asked.push(url);
    if (options.fail) throw new Error("offline");
    let body: unknown = {};
    if (url.includes("/search/page")) body = { pages: [{ key: "Virtual_memory" }] };
    else if (url.includes("/page/summary/"))
      body = {
        type: options.type ?? "standard",
        title: "Virtual memory",
        // As Wikipedia sends them now: the thumb host, with tracking parameters.
        thumbnail: { source: `${options.thumb ?? COMMONS_THUMB}?utm_source=en.wikipedia.org&utm_campaign=api`, width: 330, height: 248 },
      };
    else if (url.includes("commons.wikimedia.org/w/api.php"))
      body = {
        query: {
          pages: {
            "1": {
              imageinfo: [
                {
                  extmetadata: {
                    LicenseShortName: { value: options.licence ?? "CC BY-SA 3.0" },
                    Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ehamberg">Ehamberg</a>' },
                    ...(options.nonFree ? { NonFree: { value: "true" } } : {}),
                  },
                },
              ],
            },
          },
        },
      };
    return { ok: true, json: async () => body };
  };
  return { fetcher, asked };
}

test("a freely licensed Commons picture comes back sized and credited", async () => {
  const { fetcher, asked } = fakeFetch();
  const image = await findCommonsImage("Virtual memory", { fetch: fetcher });
  assert.deepEqual(image, {
    src: COMMONS_THUMB,
    width: 330,
    height: 248,
    alt: "Virtual memory",
    credit: "Ehamberg · CC BY-SA 3.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Virtual_memory.svg",
  });
  assert.ok(asked[2].includes("titles=File%3AVirtual_memory.svg"), "the licence is looked up for that exact file");
  assert.ok(asked.every((url) => !url.includes("notes")), "only the search words leave the server");
});

test("no picture for Wikipedia-only files, non-free licences, disambiguation pages or a failed lookup", async () => {
  assert.equal(await findCommonsImage("Windows", { fetch: fakeFetch({ thumb: LOCAL_THUMB }).fetcher }), null);
  assert.equal(await findCommonsImage("Logo", { fetch: fakeFetch({ licence: "Fair use" }).fetcher }), null);
  assert.equal(await findCommonsImage("Logo", { fetch: fakeFetch({ nonFree: true }).fetcher }), null);
  assert.equal(await findCommonsImage("Logo", { fetch: fakeFetch({ licence: "" }).fetcher }), null);
  assert.equal(await findCommonsImage("Mercury", { fetch: fakeFetch({ type: "disambiguation" }).fetcher }), null);
  assert.equal(await findCommonsImage("Anything", { fetch: fakeFetch({ fail: true }).fetcher }), null);
  assert.equal(await findCommonsImage("   ", { fetch: fakeFetch().fetcher }), null);
});
