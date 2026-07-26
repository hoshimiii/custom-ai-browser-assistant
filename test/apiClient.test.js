import test from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildChatRequest, consumeSseBuffer, readDeltaContent, requestChat, streamChat, validateBaseUrlPolicy } from "../src/shared/apiClient.js";

const settings = {
  baseUrl: "http://127.0.0.1:8787/v1/",
  apiKey: "key",
  model: "model",
  stream: true
};

test("buildChatCompletionsUrl normalizes trailing slash", () => {
  assert.equal(buildChatCompletionsUrl(settings.baseUrl), "http://127.0.0.1:8787/v1/chat/completions");
});

test("buildChatRequest uses settings model and stream", () => {
  const request = buildChatRequest(settings, [{ role: "user", content: "hi" }]);
  assert.equal(request.model, "model");
  assert.equal(request.stream, true);
  assert.equal(request.messages.length, 1);
});

test("consumeSseBuffer parses full events and keeps remainder", () => {
  const input = 'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"好"}}]}';
  const result = consumeSseBuffer(input);
  assert.equal(result.events.length, 1);
  assert.match(result.remainder, /content/);
});

test("readDeltaContent returns token", () => {
  const token = readDeltaContent('{"choices":[{"delta":{"content":"hello"}}]}');
  assert.equal(token, "hello");
});

test("validateBaseUrlPolicy allows https and local http", () => {
  assert.doesNotThrow(() => validateBaseUrlPolicy("https://api.example.com/v1"));
  assert.doesNotThrow(() => validateBaseUrlPolicy("http://127.0.0.1:11434/v1"));
});

test("validateBaseUrlPolicy rejects remote http", () => {
  assert.throws(() => validateBaseUrlPolicy("http://api.example.com/v1"), /HTTPS/);
});

test("requestChat forwards caller abort to fetch", async () => {
  const caller = new AbortController();
  const signals = [];
  const pending = requestChat({ ...settings, timeoutSeconds: 10 }, [{ role: "user", content: "hi" }], {
    signal: caller.signal,
    fetchImpl: createHangingFetch(signals)
  });
  caller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError" && error.message === "已停止");
  assert.equal(signals[0].aborted, true);
});

test("requestChat aborts fetch at the configured timeout", async () => {
  const signals = [];
  await assert.rejects(
    requestChat({ ...settings, timeoutSeconds: 1 }, [{ role: "user", content: "hi" }], { fetchImpl: createHangingFetch(signals) }),
    (error) => error.name === "TimeoutError" && error.message === "请求超时"
  );
  assert.equal(signals[0].aborted, true);
});

test("streamChat forwards caller abort to fetch", async () => {
  const caller = new AbortController();
  const signals = [];
  const pending = streamChat({ ...settings, timeoutSeconds: 10 }, [{ role: "user", content: "hi" }], {}, {
    signal: caller.signal,
    fetchImpl: createHangingFetch(signals)
  });
  caller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError" && error.message === "已停止");
  assert.equal(signals[0].aborted, true);
});

test("streamChat aborts fetch at the configured timeout", async () => {
  const signals = [];
  await assert.rejects(
    streamChat({ ...settings, timeoutSeconds: 1 }, [{ role: "user", content: "hi" }], {}, { fetchImpl: createHangingFetch(signals) }),
    (error) => error.name === "TimeoutError" && error.message === "请求超时"
  );
  assert.equal(signals[0].aborted, true);
});

function createHangingFetch(signals) {
  return async (_url, options) => {
    const { signal } = options;
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      const rejectAbort = () => reject(signal.reason);
      if (signal.aborted) rejectAbort();
      else signal.addEventListener("abort", rejectAbort, { once: true });
    });
  };
}
