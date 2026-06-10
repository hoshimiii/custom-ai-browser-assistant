import test from "node:test";
import assert from "node:assert/strict";
import { buildChunkSummaryPrompts, buildFinalSummaryPrompt, splitTextIntoChunks } from "../src/shared/chunking.js";

test("splitTextIntoChunks keeps short text as one chunk", () => {
  assert.deepEqual(splitTextIntoChunks("hello", 10), ["hello"]);
});

test("splitTextIntoChunks splits by paragraph when possible", () => {
  const text = "aaaa\n\nbbbb\n\ncccc";
  assert.deepEqual(splitTextIntoChunks(text, 8), ["aaaa", "bbbb", "cccc"]);
});

test("buildChunkSummaryPrompts includes chunk metadata", () => {
  const prompts = buildChunkSummaryPrompts({ title: "T", url: "https://e.test", text: "a".repeat(25) }, 10);
  assert.ok(prompts.length >= 3);
  assert.match(prompts[0].prompt, new RegExp(`1/${prompts.length}`));
  assert.match(prompts[0].prompt, /https:\/\/e.test/);
});

test("buildFinalSummaryPrompt combines partial summaries", () => {
  const prompt = buildFinalSummaryPrompt({ title: "T", url: "u" }, ["first", "second"]);
  assert.match(prompt, /first/);
  assert.match(prompt, /second/);
  assert.match(prompt, /可执行建议/);
});
