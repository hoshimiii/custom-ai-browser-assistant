import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoTimestampUrl, linkifyVideoTimestamps, parseTimestampLabel, parseVideoTimestampLink } from "../src/shared/videoTimestamps.js";

test("parses valid bracket timestamps and rejects invalid seconds", () => {
  assert.equal(parseTimestampLabel("[01:02]"), 62);
  assert.equal(parseTimestampLabel("[60:00]"), 3600);
  assert.equal(parseTimestampLabel("[01:01:02]"), 3662);
  assert.equal(parseTimestampLabel("[01:60]"), null);
});

test("builds canonical video timestamp URLs and preserves a Bilibili part", () => {
  assert.equal(buildVideoTimestampUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 62), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62");
  assert.equal(buildVideoTimestampUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2", 62), "https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=62");
  assert.equal(buildVideoTimestampUrl("https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ", 62), null);
});

test("accepts only exact generated timestamp Markdown links", () => {
  assert.deepEqual(parseVideoTimestampLink("[01:02](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62)"), { label: "[01:02]", seconds: 62, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62" });
  assert.equal(parseVideoTimestampLink("[01:03](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62)"), null);
  assert.equal(parseVideoTimestampLink("[01:02](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62&x=1)"), null);
});

test("linkifies timestamps without touching code or existing links", () => {
  const linked = linkifyVideoTimestamps("At [01:02], ` [01:03] `, [01:04](https://example.test), and ```\n[01:05]\n```", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(linked, /\[01:02]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&t=62\)/);
  assert.match(linked, /` \[01:03] `.*\[01:04]\(https:\/\/example\.test\).*```\n\[01:05]\n```/s);
});

test("keeps nested arbitrary link labels and unclosed fences literal", () => {
  const source = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(linkifyVideoTimestamps("[watch [01:02]](https://example.test) then [01:03]", source), "[watch [01:02]](https://example.test) then [01:03](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=63)");
  assert.equal(linkifyVideoTimestamps("Before [01:02]\n```\n[01:03]", source), "Before [01:02](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=62)\n```\n[01:03]");
});
