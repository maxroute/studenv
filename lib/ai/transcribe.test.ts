import assert from "node:assert/strict";
import test from "node:test";
import { transcribeWithFallback, TranscribeUnavailableError } from "./transcribe";

const audio = new Blob([new Uint8Array(2_000)], { type: "audio/webm" });

function fakeFetch(replies: Record<string, { status: number; body: unknown }>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const reply = Object.entries(replies).find(([part]) => url.includes(part))?.[1] ?? { status: 500, body: null };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
}

const keys = { GROQ_API_KEY: "g", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "c" };

test("Groq transcribes first", async () => {
  const { fetch, calls } = fakeFetch({ "api.groq.com": { status: 200, body: { text: "make a task" } } });
  assert.deepEqual(await transcribeWithFallback(audio, "voice.webm", { fetch, env: keys }), { text: "make a task", provider: "groq-whisper" });
  assert.equal(calls.length, 1);
});

test("when Groq fails or has no key, Cloudflare is tried", async () => {
  const { fetch } = fakeFetch({ "api.groq.com": { status: 429, body: {} }, "api.cloudflare.com": { status: 200, body: { result: { text: "hello" } } } });
  assert.deepEqual(await transcribeWithFallback(audio, "voice.webm", { fetch, env: keys }), { text: "hello", provider: "cloudflare-whisper" });
  const noGroq = fakeFetch({ "api.cloudflare.com": { status: 200, body: { result: { text: "hi" } } } });
  const result = await transcribeWithFallback(audio, "voice.webm", { fetch: noGroq.fetch, env: { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "c" } });
  assert.equal(result.provider, "cloudflare-whisper");
  assert.ok(noGroq.calls.every((url) => !url.includes("groq")), "no key, no call");
});

test("when no provider can transcribe, the error is safe to show", async () => {
  const { fetch } = fakeFetch({});
  await assert.rejects(transcribeWithFallback(audio, "voice.webm", { fetch, env: keys }), (error: Error & { status?: number }) => {
    assert.ok(error instanceof TranscribeUnavailableError);
    assert.equal(error.status, 503);
    return true;
  });
  await assert.rejects(transcribeWithFallback(audio, "voice.webm", { fetch, env: {} }), TranscribeUnavailableError);
});
