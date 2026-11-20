import assert from "node:assert/strict";
import test from "node:test";
import { createVideoTranscriptService, type VideoTranscriptDeps } from "@/lib/services/video-transcript.service";
import { TRANSCRIPT_MAX_CHARS, TRANSCRIPT_PARAGRAPH_CHARS, transcriptTextFromSegments, type CaptionResult } from "./video-transcript";

test("segments join into one text without line breaks, repeated spaces or sound cues", () => {
  const text = transcriptTextFromSegments([
    { text: "[Music]" },
    { text: "so today we're\nlooking at" },
    { text: "  photosynthesis  " },
    { text: "(applause)" },
    { text: "" },
    { text: "in the leaf" },
  ]);
  assert.equal(text, "so today we're looking at photosynthesis in the leaf");
});

test("long speech is split into paragraphs at segment boundaries", () => {
  const segment = { text: "word ".repeat(40).trim() };
  const text = transcriptTextFromSegments(Array.from({ length: 30 }, () => segment));
  const paragraphs = text.split("\n\n");
  assert.ok(paragraphs.length > 1);
  for (const paragraph of paragraphs) {
    assert.ok(paragraph.length < TRANSCRIPT_PARAGRAPH_CHARS + segment.text.length + 1);
    assert.ok(!paragraph.startsWith(" ") && !paragraph.endsWith(" "));
  }
});

test("a very long transcript is cut, and no captions give empty text", () => {
  const huge = transcriptTextFromSegments(Array.from({ length: 5_000 }, () => ({ text: "x".repeat(100) })));
  assert.equal(huge.length, TRANSCRIPT_MAX_CHARS);
  assert.equal(transcriptTextFromSegments([]), "");
  assert.equal(transcriptTextFromSegments([{ text: "[Music]" }]), "");
});

type Video = Awaited<ReturnType<VideoTranscriptDeps["findOwnedVideo"]>>;

function setup(video: Video, captions: CaptionResult = { ok: true, text: "the transcript" }) {
  const calls = { fetched: [] as string[], saved: [] as Array<[string, string]> };
  const ensure = createVideoTranscriptService({
    findOwnedVideo: async (assetId, ownerId) => (video && video.id === assetId && ownerId === "u1" ? video : null),
    saveTranscript: async (assetId, transcript) => {
      calls.saved.push([assetId, transcript]);
    },
    fetchCaptions: async (videoId) => {
      calls.fetched.push(videoId);
      return captions;
    },
  });
  return { ensure, calls };
}

const youtube = { id: "a1", kind: "video", sourceUrl: "https://www.youtube.com/watch?v=aircAruvnKk", transcript: null };

test("a YouTube video's captions are fetched and saved", async () => {
  const { ensure, calls } = setup(youtube);
  assert.deepEqual(await ensure("u1", "a1"), { status: "saved", chars: "the transcript".length });
  assert.deepEqual(calls.fetched, ["aircAruvnKk"]);
  assert.deepEqual(calls.saved, [["a1", "the transcript"]]);
});

test("another user's asset is not found and nothing is fetched", async () => {
  const { ensure, calls } = setup(youtube);
  await assert.rejects(ensure("u2", "a1"), (error: Error & { status?: number }) => error.status === 404);
  assert.deepEqual(calls.fetched, []);
});

test("a saved transcript is not fetched again", async () => {
  const { ensure, calls } = setup({ ...youtube, transcript: "already here ".repeat(20) });
  assert.deepEqual(await ensure("u1", "a1"), { status: "exists" });
  assert.deepEqual(calls.fetched, []);
});

test("non-YouTube links, playlists and non-videos are not supported", async () => {
  for (const video of [
    { ...youtube, sourceUrl: "https://vimeo.com/123" },
    { ...youtube, sourceUrl: "https://www.youtube.com/playlist?list=PL123" },
    { ...youtube, kind: "webpage" },
    { ...youtube, sourceUrl: null },
  ]) {
    const { ensure, calls } = setup(video);
    assert.deepEqual(await ensure("u1", "a1"), { status: "unsupported" });
    assert.deepEqual(calls.fetched, []);
  }
});

test("a video without captions saves nothing and says why", async () => {
  const { ensure, calls } = setup(youtube, { ok: false, reason: "no_captions" });
  assert.deepEqual(await ensure("u1", "a1"), { status: "unavailable", reason: "no_captions" });
  assert.deepEqual(calls.saved, []);
});

test("a placeholder shorter than a real transcript is replaced", async () => {
  const { ensure, calls } = setup({ ...youtube, transcript: "Test" });
  assert.deepEqual(await ensure("u1", "a1"), { status: "saved", chars: "the transcript".length });
  assert.deepEqual(calls.saved, [["a1", "the transcript"]]);
});
