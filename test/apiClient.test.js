import test from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildChatRequest, consumeSseBuffer, readDeltaContent } from "../src/shared/apiClient.js";

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
