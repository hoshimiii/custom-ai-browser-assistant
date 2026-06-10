import test from "node:test";
import assert from "node:assert/strict";
import { buildImageQuestionMessage, buildScreenshotPrompt, isImageDataUrl } from "../src/shared/vision.js";

test("isImageDataUrl accepts common image data URLs", () => {
  assert.equal(isImageDataUrl("data:image/png;base64,abcd1234+/="), true);
  assert.equal(isImageDataUrl("data:text/plain;base64,abcd"), false);
});

test("buildScreenshotPrompt uses default question", () => {
  assert.match(buildScreenshotPrompt(""), /浏览器截图/);
});

test("buildImageQuestionMessage creates OpenAI-compatible content parts", () => {
  const message = buildImageQuestionMessage("data:image/png;base64,abcd", "what is this?");
  assert.equal(message.role, "user");
  assert.equal(message.content[0].type, "text");
  assert.equal(message.content[1].type, "image_url");
});

test("buildImageQuestionMessage rejects invalid data URL", () => {
  assert.throws(() => buildImageQuestionMessage("https://example.com/a.png"), /无效/);
});
