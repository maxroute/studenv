import assert from "node:assert/strict";
import test from "node:test";
import { findYouTubeVideo, onTopicVideos, pickVideo, plainTitle, rankVideos, youTubeWatchUrl, type YouTubeFetch } from "./youtube-search";

const item = (videoId: string | undefined, title: string, extra: { live?: string; channel?: string } = {}) => ({
  id: { videoId },
  snippet: { title, channelTitle: extra.channel ?? "Teacher", liveBroadcastContent: extra.live ?? "none" },
});

test("the first result whose title names the subject is picked; live streams and bad ids are skipped", () => {
  const items = [
    item(undefined, "A channel"),
    item("short", "Deadlock explained"),
    item("AAAAAAAAAAA", "Deadlocks LIVE", { live: "live" }),
    item("BBBBBBBBBBB", "Top 10 cooking tips"),
    item("CCCCCCCCCCC", "Deadlock in Operating Systems &amp; how to avoid it", { channel: "Neso &amp; Co" }),
  ];
  assert.deepEqual(pickVideo(items, "deadlock"), { videoId: "CCCCCCCCCCC", title: "Deadlock in Operating Systems & how to avoid it", channel: "Neso & Co" });
  assert.deepEqual(pickVideo(items, "deadlocks")?.videoId, "CCCCCCCCCCC", "plurals match");
  assert.equal(pickVideo([item("BBBBBBBBBBB", "Top 10 cooking tips")], "operating systems"), null, "nothing off-topic");
  assert.equal(plainTitle("Q&#39;s &quot;answer&quot;"), 'Q\'s "answer"');
  assert.equal(youTubeWatchUrl("CCCCCCCCCCC"), "https://www.youtube.com/watch?v=CCCCCCCCCCC");
});

test("the official search is asked for a safe, embeddable lesson, and only the search words are sent", async () => {
  const asked: string[] = [];
  const fetcher: YouTubeFetch = async (url) => {
    asked.push(url);
    if (url.includes("/videos?"))
      return {
        ok: true,
        json: async () => ({
          items: [
            { id: "DDDDDDDDDDD", statistics: { viewCount: "500" }, contentDetails: { caption: "false" } },
            { id: "EEEEEEEEEEE", statistics: { viewCount: "90" }, contentDetails: { caption: "true" } },
          ],
        }),
      };
    return { ok: true, json: async () => ({ items: [item("DDDDDDDDDDD", "Paging in operating systems"), item("EEEEEEEEEEE", "Paging explained"), item("FFFFFFFFFFF", "Cooking pasta")] }) };
  };
  const video = await findYouTubeVideo("paging operating system explained", "paging", { apiKey: "k", fetch: fetcher, now: () => 1 });
  assert.equal(video?.videoId, "EEEEEEEEEEE", "the captioned lesson wins over a more viewed one without captions");
  assert.equal(new URL(asked[1]).searchParams.get("id"), "DDDDDDDDDDD,EEEEEEEEEEE", "only on-topic videos are checked");
  const url = new URL(asked[0]);
  assert.equal(url.origin + url.pathname, "https://www.googleapis.com/youtube/v3/search");
  for (const [key, value] of Object.entries({ type: "video", safeSearch: "strict", videoEmbeddable: "true", videoDuration: "medium", q: "paging operating system explained", relevanceLanguage: "en" })) assert.equal(url.searchParams.get(key), value, key);
  await findYouTubeVideo("paging operating system explained", "paging", { apiKey: "k", fetch: fetcher, now: () => 2 });
  assert.equal(asked.length, 2, "a repeat search is answered from the day's cache");
});

test("no key, an error, or no answer means no video, never a failure", async () => {
  let called = false;
  const fetcher: YouTubeFetch = async () => {
    called = true;
    throw new Error("offline");
  };
  assert.equal(await findYouTubeVideo("kernel", "kernel", { fetch: fetcher }), null);
  assert.equal(called, false, "without a key nothing is sent");
  assert.equal(await findYouTubeVideo("kernel basics", "kernel", { apiKey: "k", fetch: fetcher }), null);
  assert.equal(await findYouTubeVideo("kernel quota", "kernel", { apiKey: "k", fetch: async () => ({ ok: false, json: async () => ({}) }) }), null);
});

test("on-topic English lessons are ranked: captioned first, then views; other scripts are skipped", () => {
  const videos = onTopicVideos(
    [
      item("AAAAAAAAAAA", "Deadlock basics"),
      item("BBBBBBBBBBB", "डेडलॉक क्या है deadlock"),
      item("CCCCCCCCCCC", "Deadlock conditions"),
      item("DDDDDDDDDDD", "Deadlock in OS"),
    ],
    "deadlock",
  );
  assert.deepEqual(videos.map((video) => video.videoId), ["AAAAAAAAAAA", "CCCCCCCCCCC", "DDDDDDDDDDD"]);
  const ranked = rankVideos(videos, [
    { id: "AAAAAAAAAAA", statistics: { viewCount: 10 }, contentDetails: { caption: "false" } },
    { id: "CCCCCCCCCCC", statistics: { viewCount: 5 }, contentDetails: { caption: "true" } },
    { id: "DDDDDDDDDDD", statistics: { viewCount: 50 }, contentDetails: { caption: "true" } },
  ]);
  assert.deepEqual(ranked.map((video) => video.videoId), ["DDDDDDDDDDD", "CCCCCCCCCCC", "AAAAAAAAAAA"]);
  assert.deepEqual(rankVideos(videos, []).map((video) => video.videoId), ["AAAAAAAAAAA", "CCCCCCCCCCC", "DDDDDDDDDDD"], "without stats, YouTube's order stands");
  assert.equal(onTopicVideos([item("BBBBBBBBBBB", "ডেডলক deadlock")], "deadlock", "bn").length, 1, "a Bengali lesson is fine for a Bengali request");
  assert.deepEqual(onTopicVideos([item("AAAAAAAAAAA", "How an OS Boots"), item("BBBBBBBBBBB", "Boot process"), item("CCCCCCCCCCC", "Bootstrap CSS")], "booting").map((video) => video.videoId), ["AAAAAAAAAAA", "BBBBBBBBBBB"], "word forms match, other words don't");
});
