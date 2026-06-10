import test from "node:test";
import assert from "node:assert/strict";
import { extractSearchQuery, normalizeWhitespace, truncateText } from "../src/shared/text.js";

test("normalizeWhitespace collapses spaces and blank lines", () => {
  assert.equal(normalizeWhitespace(" a\t b\n\n\nc "), "a b\n\nc");
});

test("truncateText preserves short text", () => {
  assert.equal(truncateText("hello", 10), "hello");
});

test("truncateText marks truncated content", () => {
  const result = truncateText("abcdef", 3);
  assert.match(result, /^abc/);
  assert.match(result, /内容已截断/);
});

test("extractSearchQuery reads Google and Bing q params", () => {
  assert.equal(extractSearchQuery("https://www.google.com/search?q=chrome+ai"), "chrome ai");
  assert.equal(extractSearchQuery("https://www.bing.com/search?q=monica"), "monica");
});
