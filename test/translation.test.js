import test from "node:test";
import assert from "node:assert/strict";
import { buildInlineTranslationPrompt, parseInlineTranslationResponse } from "../src/shared/translation.js";

test("buildInlineTranslationPrompt asks for id-preserving JSON", () => {
  const prompt = buildInlineTranslationPrompt([{ id: "b1", text: "Hello world" }], { targetLanguage: "中文" });
  assert.match(prompt, /不可信引用材料/);
  assert.match(prompt, /翻译成中文/);
  assert.match(prompt, /"id": "b1"/);
  assert.match(prompt, /只输出 JSON/);
});

test("parseInlineTranslationResponse reads fenced JSON arrays", () => {
  const result = parseInlineTranslationResponse('```json\n[{"id":"b1","text":"你好"}]\n```');
  assert.deepEqual(result, [{ id: "b1", text: "你好" }]);
});

test("parseInlineTranslationResponse reads object-wrapped translations", () => {
  const result = parseInlineTranslationResponse('{"translations":[{"id":"b2","translation":"世界"}]}');
  assert.deepEqual(result, [{ id: "b2", text: "世界" }]);
});
