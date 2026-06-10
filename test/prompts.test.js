import test from "node:test";
import assert from "node:assert/strict";
import { buildPageQuestionPrompt, buildSelectionPrompt } from "../src/shared/prompts.js";

test("buildPageQuestionPrompt includes page metadata and question", () => {
  const prompt = buildPageQuestionPrompt({
    title: "Example",
    url: "https://example.com",
    text: "Page body"
  }, "What is this?");
  assert.match(prompt, /Example/);
  assert.match(prompt, /https:\/\/example.com/);
  assert.match(prompt, /What is this\?/);
});

test("buildSelectionPrompt supports translate action", () => {
  const prompt = buildSelectionPrompt("translate", "hello", { targetLanguage: "中文" });
  assert.match(prompt, /翻译成中文/);
  assert.match(prompt, /hello/);
});
