import test from "node:test";
import assert from "node:assert/strict";
import { buildPageContext, detectPageType } from "../src/shared/pageTypes.js";

test("detectPageType identifies YouTube watch pages", () => {
  assert.equal(detectPageType("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(detectPageType("https://youtu.be/abc"), "youtube");
});

test("detectPageType identifies PDF URLs and MIME type", () => {
  assert.equal(detectPageType("https://example.com/file.pdf"), "pdf");
  assert.equal(detectPageType("https://example.com/view", "application/pdf"), "pdf");
});

test("buildPageContext includes YouTube transcript fields", () => {
  const context = buildPageContext({
    type: "youtube",
    title: "Video",
    url: "https://www.youtube.com/watch?v=1",
    author: "Channel",
    transcript: "hello transcript"
  });
  assert.match(context, /YouTube 视频/);
  assert.match(context, /Channel/);
  assert.match(context, /hello transcript/);
});
