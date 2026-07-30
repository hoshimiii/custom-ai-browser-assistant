import test from "node:test";
import assert from "node:assert/strict";
import { buildBilibiliSubtitleApiUrl, canonicalizeLocalAsrVideoUrl, isBilibiliSubtitleUrl, normalizeBilibiliSubtitleUrl, normalizeYouTubeTimedtextUrl, parseBilibiliVideoUrl, parseYouTubeVideoUrl } from "../src/shared/videoUrls.js";

test("rejects spoofed video and subtitle hosts", () => {
  assert.equal(parseYouTubeVideoUrl("https://www.youtube.com.evil.test/watch?v=x"), null);
  assert.equal(parseBilibiliVideoUrl("https://www.bilibili.com.evil.test/video/BV1xx411c7mD"), null);
  assert.equal(normalizeYouTubeTimedtextUrl("https://www.youtube.com.evil.test/api/timedtext?x=1"), null);
  assert.equal(isBilibiliSubtitleUrl("https://aisubtitle.hdslb.com.evil.test/bfs/a.json"), false);
  assert.equal(normalizeBilibiliSubtitleUrl("//evil.test/bfs/a.json"), null);
});

test("canonicalizes only companion-supported video URLs", () => {
  assert.equal(canonicalizeLocalAsrVideoUrl("https://youtube.com/watch?v=dQw4w9WgXcQ&utm=x"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(canonicalizeLocalAsrVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=3"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(canonicalizeLocalAsrVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2&utm=x"), "https://www.bilibili.com/video/BV1xx411c7mD?p=2");
  for (const value of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "https://user@www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com:443/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ#x", "https://www.bilibili.com/video/BV1xx411c7mD?p=0", "https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ"]) assert.equal(canonicalizeLocalAsrVideoUrl(value), null);
});

test("validates canonical subtitle endpoints and identifiers", () => {
  assert.equal(normalizeYouTubeTimedtextUrl("https://www.youtube.com/api/timedtext?sig=x&fmt=srv3"), "https://www.youtube.com/api/timedtext?sig=x&fmt=json3");
  assert.match(buildBilibiliSubtitleApiUrl("https://www.bilibili.com/video/BV1xx411c7mD", 9), /bvid=BV1xx411c7mD.*cid=9/);
  assert.equal(buildBilibiliSubtitleApiUrl("https://www.bilibili.com/video/BV1xx411c7mD", "bad"), null);
  assert.equal(normalizeBilibiliSubtitleUrl("//aisubtitle.hdslb.com/bfs/a.json"), "https://aisubtitle.hdslb.com/bfs/a.json");
});
