import test from "node:test";
import assert from "node:assert/strict";
import { buildChunkSummaryPrompts, buildFinalSummaryPrompt, getEffectivePageChunkChars, getPageSummaryText, splitTextIntoChunks } from "../src/shared/chunking.js";
import { replaceWithPlatformSubtitle } from "../src/shared/platformSubtitles.js";

test("splitTextIntoChunks keeps short text as one chunk", () => {
  assert.deepEqual(splitTextIntoChunks("hello", 10), ["hello"]);
});

test("splitTextIntoChunks splits by paragraph when possible", () => {
  const text = "aaaa\n\nbbbb\n\ncccc";
  assert.deepEqual(splitTextIntoChunks(text, 8), ["aaaa", "bbbb", "cccc"]);
});

test("page chunks never exceed the single-prompt page cap", () => {
  const chunks = splitTextIntoChunks("a".repeat(25000), 30000);
  assert.equal(getEffectivePageChunkChars(30000), 24000);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 24000);
  assert.equal(chunks[1].length, 1000);
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

test("platform subtitle context appears once in summary prompts", () => {
  const page = replaceWithPlatformSubtitle({ type: "youtube", title: "T", url: "https://www.youtube.com/watch?v=x", text: "visible", transcript: "visible" }, { text: "[00:00] again", platform: "YouTube", language: "English" });
  assert.equal((getPageSummaryText(page).match(/\[00:00\] again/g) || []).length, 1);
  assert.equal((buildChunkSummaryPrompts(page, 9999)[0].prompt.match(/\[00:00\] again/g) || []).length, 1);
});

test("Bilibili platform subtitle context appears once in summary prompts", () => {
  const page = replaceWithPlatformSubtitle({ type: "bilibili-video", title: "T", url: "https://www.bilibili.com/video/BV1xx411c7mD", text: "visible" }, { text: "[00:00] 字幕", platform: "Bilibili", language: "中文" });
  assert.equal((getPageSummaryText(page).match(/\[00:00\] 字幕/g) || []).length, 1);
  assert.equal((buildChunkSummaryPrompts(page, 9999)[0].prompt.match(/\[00:00\] 字幕/g) || []).length, 1);
});

test("timed evidence requires exact timestamps in chunk and final prompts only", () => {
  const timed = replaceWithPlatformSubtitle({ title: "T", url: "u" }, { text: "[00:01] hi", platform: "YouTube" });
  assert.match(buildChunkSummaryPrompts(timed)[0].prompt, /不要编造、猜测或改写时间戳/);
  assert.match(buildFinalSummaryPrompt(timed, ["[00:01] hi"]), /\[MM:SS]/);
  assert.doesNotMatch(buildFinalSummaryPrompt({ title: "T", url: "u" }, ["hi"]), /时间戳要求/);
});
