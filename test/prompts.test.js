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
  assert.match(prompt, /不可信引用材料/);
});

test("buildSelectionPrompt supports translate action", () => {
  const prompt = buildSelectionPrompt("translate", "hello", { targetLanguage: "中文" });
  assert.match(prompt, /翻译成中文/);
  assert.match(prompt, /hello/);
});

test("buildSelectionPrompt supports every selection-toolbar action", () => {
  for (const action of ["explain", "translate", "summarize", "rewrite", "continue"]) {
    assert.match(buildSelectionPrompt(action, "选中文本", { targetLanguage: "English", tone: "正式" }), /选中文本/);
  }
  assert.match(buildSelectionPrompt("rewrite", "选中文本", { tone: "正式" }), /正式/);
});
