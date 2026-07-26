import test from "node:test";
import assert from "node:assert/strict";
import { buildPageContext, buildPageIdentity, createSelectedRegionPageSnapshot, detectPageType, resolveSelectedRegionPageSnapshot } from "../src/shared/pageTypes.js";

test("detectPageType identifies YouTube watch pages", () => {
  assert.equal(detectPageType("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(detectPageType("https://youtu.be/abc"), "youtube");
});

test("detectPageType identifies PDF URLs and MIME type", () => {
  assert.equal(detectPageType("https://example.com/file.pdf"), "pdf");
  assert.equal(detectPageType("https://example.com/view", "application/pdf"), "pdf");
});

test("detectPageType identifies Bilibili video pages without adding unavailable metadata", () => {
  assert.equal(detectPageType("https://www.bilibili.com/video/BV1xx411c7mD"), "bilibili-video");
  const context = buildPageContext({ type: "bilibili-video", title: "Video", url: "https://www.bilibili.com/video/BV1", text: "visible text" });
  assert.match(context, /哔哩哔哩视频/);
  assert.match(context, /visible text/);
  assert.doesNotMatch(context, /频道|字幕/);
});

test("buildPageIdentity changes with the active tab or URL", () => {
  assert.equal(buildPageIdentity(7, "https://example.com/a"), "7:https://example.com/a");
  assert.notEqual(buildPageIdentity(7, "https://example.com/a"), buildPageIdentity(7, "https://example.com/b"));
  assert.notEqual(buildPageIdentity(7, "https://example.com/a"), buildPageIdentity(8, "https://example.com/a"));
  assert.equal(buildPageIdentity(7, "https://example.com"), buildPageIdentity(7, "https://example.com/"));
  assert.equal(buildPageIdentity(null, "https://example.com"), "");
});

test("selected-region snapshot only resolves for its exact tab and URL", () => {
  const page = createSelectedRegionPageSnapshot(
    { id: 7, url: "https://example.com/a", title: "Page" },
    { id: "region", label: "正文", text: "selected text" }
  );
  assert.equal(resolveSelectedRegionPageSnapshot(page, { id: 7, url: "https://example.com/a" })?.text, "selected text");
  assert.equal(resolveSelectedRegionPageSnapshot(page, { id: 8, url: "https://example.com/a" }), null);
  assert.equal(resolveSelectedRegionPageSnapshot(page, { id: 7, url: "https://example.com/b" }), null);
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
