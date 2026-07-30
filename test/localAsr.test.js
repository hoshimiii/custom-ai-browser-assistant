import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL_ASR_BASE_URL, LocalAsrError, testLocalAsrHealth, transcribeWithLocalAsr } from "../src/shared/localAsr.js";

const token = "t".repeat(32);
const video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const response = (status, body) => ({ status, json: async () => body });

test("health uses the fixed loopback endpoint and auth header", async () => {
  let call;
  await testLocalAsrHealth(token, { fetchFn: async (...args) => { call = args; return response(200, { status: "ok" }); } });
  assert.equal(call[0], `${LOCAL_ASR_BASE_URL}/health`);
  assert.deepEqual(call[1].headers, { "Content-Type": "application/json", "X-Local-Asr-Token": token });
});

test("starts once, polls lifecycle, and returns only a bounded transcript", async () => {
  const calls = [];
  const transcript = { text: "[0.000-1.000] hello", language: "en", segments: [{ start: 0, end: 1, text: "hello" }] };
  const results = [response(202, { id: "a".repeat(32), status: "queued" }), response(200, { id: "a".repeat(32), status: "transcribing" }), response(200, { id: "a".repeat(32), status: "completed", transcript })];
  const actual = await transcribeWithLocalAsr(video, token, { fetchFn: async (url, options) => { calls.push([url, options]); return results.shift(); }, pollIntervalMs: 0 });
  assert.equal(actual, transcript);
  assert.equal(calls.filter(([url]) => url.endsWith("/jobs")).length, 1);
  assert.equal(JSON.parse(calls[0][1].body).url, video);
});

test("normal polling removes its abort listener after the delay", async () => {
  let added = 0, removed = 0;
  const signal = { aborted: false, addEventListener() { added += 1; }, removeEventListener() { removed += 1; } };
  const transcript = { text: "ok", language: "en", segments: [] };
  const results = [response(202, { id: "c".repeat(32), status: "queued" }), response(200, { id: "c".repeat(32), status: "queued" }), response(200, { id: "c".repeat(32), status: "completed", transcript })];
  await transcribeWithLocalAsr(video, token, { signal, pollIntervalMs: 0, fetchFn: async () => results.shift() });
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test("maps Cloudflare helper failures without leaking response content", async () => {
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => response(503, { error: { code: "CLOUDFLARE_AUTH_FAILED", detail: "secret token" } }) }), /Cloudflare ASR 认证失败/);
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => response(503, { error: { code: "CLOUDFLARE_RATE_LIMITED" } }) }), /限流/);
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => response(503, { error: { code: "FFMPEG_MISSING" } }) }), /缺少 FFmpeg/);
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => response(503, { error: { code: "AUDIO_TOO_LARGE" } }) }), /超过 Cloudflare ASR 限制/);
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => { throw new Error("offline token=" + token); } }), /助手不可用/);
  await assert.rejects(() => testLocalAsrHealth(token, { fetchFn: async () => response(200, { status: "bad", extra: "x" }) }), LocalAsrError);
});

test("rejects malformed completion and cancels the single active job on abort", async () => {
  const abort = new AbortController();
  const calls = [];
  await assert.rejects(() => transcribeWithLocalAsr(video, token, {
    signal: abort.signal, pollIntervalMs: 0,
    fetchFn: async (url, options) => { calls.push([url, options]); if (url.endsWith("/jobs")) return response(202, { id: "b".repeat(32), status: "queued" }); if (options.method === "DELETE") return response(202, { status: "cancelling" }); abort.abort(); throw new DOMException("Aborted", "AbortError"); }
  }), /Aborted/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.filter(([, options]) => options.method === "DELETE").length, 1);
  await assert.rejects(() => transcribeWithLocalAsr(video, token, { fetchFn: async () => response(202, { id: "bad", status: "queued" }) }), /无效响应/);
});
