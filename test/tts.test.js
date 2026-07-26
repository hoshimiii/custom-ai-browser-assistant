import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/shared/apiClient.js";
import { TTS_MAX_CHARS, buildSpeechRequest, requestSpeech, resolveTtsSettings, splitTtsText } from "../src/shared/tts.js";

const settings = {
  baseUrl: "https://chat.example/v1/",
  apiKey: "chat-key",
  ttsModel: "tts-1",
  ttsVoice: "alloy",
  ttsSpeed: 1,
  ttsTimeoutSeconds: 1
};

test("resolveTtsSettings falls back to chat endpoint and key", () => {
  assert.deepEqual(resolveTtsSettings(settings), {
    baseUrl: "https://chat.example/v1",
    apiKey: "chat-key",
    model: "tts-1",
    voice: "alloy",
    speed: 1,
    timeoutSeconds: 1
  });
});

test("buildSpeechRequest validates policy and creates OpenAI-compatible payload", () => {
  assert.deepEqual(buildSpeechRequest(settings, " hello "), {
    model: "tts-1", input: "hello", voice: "alloy", speed: 1, response_format: "mp3"
  });
  assert.throws(() => buildSpeechRequest({ ...settings, ttsBaseUrl: "http://example.com/v1" }, "hello"), /HTTPS/);
  assert.throws(() => buildSpeechRequest({ ...settings, ttsSpeed: 4.1 }, "hello"), /0.25/);
  assert.throws(() => buildSpeechRequest(settings, " "), /不能为空/);
  assert.throws(() => buildSpeechRequest(settings, "x".repeat(4097)), /4096/);
});

test("splitTtsText keeps every chunk within the TTS limit", () => {
  const chunks = splitTtsText("x".repeat(TTS_MAX_CHARS + 1));
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= TTS_MAX_CHARS));
});

test("requestSpeech posts MP3 request and returns its blob", async () => {
  let captured;
  const audio = new Blob(["audio"], { type: "audio/mpeg" });
  const result = await requestSpeech(settings, "hello", {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, blob: async () => audio };
    }
  });
  assert.equal(result, audio);
  assert.equal(captured.url, "https://chat.example/v1/audio/speech");
  assert.equal(captured.options.headers.Authorization, "Bearer chat-key");
  assert.equal(JSON.parse(captured.options.body).response_format, "mp3");
});

test("requestSpeech exposes useful HTTP errors and rejects empty audio", async () => {
  await assert.rejects(
    requestSpeech(settings, "hello", { fetchImpl: async () => ({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({ error: { message: "bad key" } }) }) }),
    (error) => error instanceof ApiError && error.status === 401 && error.message === "bad key"
  );
  await assert.rejects(requestSpeech(settings, "hello", { fetchImpl: async () => ({ ok: true, blob: async () => new Blob() }) }), /空音频/);
});

test("requestSpeech forwards caller abort and timeout abort", async () => {
  const caller = new AbortController();
  const pending = requestSpeech(settings, "hello", { signal: caller.signal, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
  caller.abort();
  await assert.rejects(pending, /aborted/);

  let timeoutSignal;
  await assert.rejects(
    requestSpeech({ ...settings, ttsTimeoutSeconds: 0.001 }, "hello", { fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      timeoutSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
    }) }),
    /timed out/
  );
  assert.equal(timeoutSignal.aborted, true);
});
