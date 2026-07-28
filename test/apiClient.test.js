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

test("buildChatRequest sends valid effort only for the actual GPT-5 request model", () => {
  const messages = [{ role: "user", content: "hi" }];
  assert.equal(buildChatRequest({ ...settings, model: "openai/gpt-5", reasoningEffort: "high" }, messages).reasoning_effort, "high");
  assert.equal(buildChatRequest({ ...settings, model: "gpt-5.4", reasoningEffort: "none" }, messages).reasoning_effort, "none");
  assert.equal(buildChatRequest({ ...settings, model: "gpt-5.4", reasoningEffort: "minimal" }, messages).reasoning_effort, "minimal");
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "openai/gpt-5", reasoningEffort: "" }, messages), false);
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "openai/gpt-5", reasoningEffort: "invalid" }, messages), false);
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "gpt-4o", reasoningEffort: "high" }, messages), false);
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "gpt-5-audio", reasoningEffort: "high" }, messages), false);
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "openai/gpt-5-image", reasoningEffort: "high" }, messages), false);
  assert.equal("reasoning_effort" in buildChatRequest({ ...settings, model: "gpt-5", reasoningEffort: "high" }, messages, { model: "other/model" }), false);
});

test("consumeSseBuffer parses full events and keeps remainder", () => {
  const input = 'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"好"}}]}';
  const result = consumeSseBuffer(input);
  assert.equal(result.events.length, 1);
  assert.match(result.remainder, /content/);
});

test("consumeSseBuffer parses CRLF events", () => {
  const result = consumeSseBuffer('data: {"choices":[{"delta":{"content":"好"}}]}\r\n\r\n');
  assert.equal(result.events.length, 1);
  assert.equal(readDeltaContent(result.events[0]), "好");
});

test("readDeltaContent returns token", () => {
  const token = readDeltaContent('{"choices":[{"delta":{"content":"hello"}}]}');
  assert.equal(token, "hello");
});

test("readDeltaContent accepts Responses output text deltas without reasoning", () => {
  assert.equal(readDeltaContent('{"type":"response.output_text.delta","delta":"hello"}'), "hello");
  assert.equal(readDeltaContent('{"type":"response.reasoning_text.delta","delta":"hidden"}'), "");
});

test("requestChat accepts simple text-part content arrays", async () => {
  const text = await requestChat(settings, [{ role: "user", content: "hi" }], {
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: [{ type: "text", text: "hello" }] } }] })
  });
  assert.equal(text, "hello");
});

test("requestChat accepts untyped text parts but excludes reasoning parts", async () => {
  const text = await requestChat(settings, [{ role: "user", content: "hi" }], {
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: [{ text: "hello" }, { type: "reasoning", text: "hidden" }] } }] })
  });
  assert.equal(text, "hello");
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

test("streamChat flushes a terminal SSE event without a separator", async () => {
  const tokens = [];
  await streamChat(settings, [{ role: "user", content: "hi" }], {
    onToken: (token) => tokens.push(token)
  }, {
    fetchImpl: async () => streamResponse('data: {"choices":[{"delta":{"content":"最后"}}]}')
  });
  assert.deepEqual(tokens, ["最后"]);
});

test("streamChat accepts Responses-style output text SSE", async () => {
  const tokens = [];
  await streamChat(settings, [{ role: "user", content: "hi" }], {
    onToken: (token) => tokens.push(token)
  }, {
    fetchImpl: async () => streamResponse('data: {"type":"response.output_text.delta","delta":"你"}\n\ndata: {"type":"response.output_text.delta","delta":"好"}\n\ndata: [DONE]\n\n')
  });
  assert.deepEqual(tokens, ["你", "好"]);
});

test("streamChat accepts a Responses JSON completion returned while streaming", async () => {
  const tokens = [];
  await streamChat(settings, [{ role: "user", content: "hi" }], {
    onToken: (token) => tokens.push(token)
  }, {
    fetchImpl: async () => streamResponse('{"output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}]}')
  });
  assert.deepEqual(tokens, ["hello"]);
});

test("streamChat accepts a Chat Completions JSON body returned while streaming", async () => {
  const tokens = [];
  await streamChat(settings, [{ role: "user", content: "hi" }], {
    onToken: (token) => tokens.push(token)
  }, {
    fetchImpl: async () => streamResponse('{"choices":[{"message":{"content":"hello"}}]}')
  });
  assert.deepEqual(tokens, ["hello"]);
});

test("requestChat rejects an empty successful response", async () => {
  await assert.rejects(
    requestChat(settings, [{ role: "user", content: "hi" }], {
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" } }] })
    }),
    /空内容/
  );
});

test("streamChat rejects an empty successful response", async () => {
  await assert.rejects(
    streamChat(settings, [{ role: "user", content: "hi" }], {}, {
      fetchImpl: async () => streamResponse('data: [DONE]\n\n')
    }),
    /空内容/
  );
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

function jsonResponse(payload) {
  return { ok: true, json: async () => payload };
}

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text);
  return {
    ok: true,
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } })
  };
}
