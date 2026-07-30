import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFloatingMessage,
  applyFloatingCompression,
  buildFloatingSourcePrompt,
  createFloatingSession,
  FLOATING_IDLE_COMPRESSION_MS,
  FLOATING_SESSION_MESSAGE_LIMIT,
  mergeConversationHistory,
  normalizeFloatingPageKey,
  shouldCompressFloatingSession,
  upsertFloatingSession
} from "../src/shared/floatingMemory.js";

test("normalizeFloatingPageKey keeps page URL without hash", () => {
  assert.equal(normalizeFloatingPageKey("https://example.com/a?q=1#top"), "https://example.com/a?q=1");
});

test("createFloatingSession stores page scoped source", () => {
  const session = createFloatingSession({
    id: "s1",
    pageUrl: "https://example.com/page",
    source: { type: "selection", text: "hello" }
  }, 100);
  assert.equal(session.pageKey, "https://example.com/page");
  assert.equal(session.source.type, "selection");
  assert.equal(session.lastActivityAt, 100);
});

test("upsertFloatingSession replaces by id and sorts newest first", () => {
  const old = createFloatingSession({ id: "a", pageUrl: "https://a.test" }, 100);
  const newer = createFloatingSession({ id: "a", pageUrl: "https://a.test", title: "new" }, 200);
  const other = createFloatingSession({ id: "b", pageUrl: "https://b.test" }, 150);
  const result = upsertFloatingSession([old, other], newer);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, "new");
});

test("mergeConversationHistory distinguishes kinds and sorts by latest timestamp", () => {
  const entries = mergeConversationHistory(
    [{ id: "history", updatedAt: 200 }],
    [{ id: "floating", createdAt: 300 }]
  );
  assert.deepEqual(entries.map((entry) => [entry.kind, entry.record.id]), [["floating", "floating"], ["conversation", "history"]]);
});

test("shouldCompressFloatingSession waits for five idle minutes", () => {
  let session = createFloatingSession({ id: "s", pageUrl: "https://example.com" }, 1000);
  for (let index = 0; index < 6; index += 1) {
    session = appendFloatingMessage(session, { role: index % 2 ? "assistant" : "user", content: `m${index}` }, 1000 + index);
  }
  assert.equal(shouldCompressFloatingSession(session, session.lastActivityAt + FLOATING_IDLE_COMPRESSION_MS - 1), false);
  assert.equal(shouldCompressFloatingSession(session, session.lastActivityAt + FLOATING_IDLE_COMPRESSION_MS), true);
});

test("applyFloatingCompression stores summary and keeps recent messages", () => {
  let session = createFloatingSession({ id: "s", pageUrl: "https://example.com" }, 100);
  for (let index = 0; index < 7; index += 1) {
    session = appendFloatingMessage(session, { role: "user", content: `m${index}` }, 100 + index);
  }
  const compressed = applyFloatingCompression(session, "summary", 1000);
  assert.equal(compressed.memorySummary, "summary");
  assert.equal(compressed.messages.length, 4);
  assert.equal(compressed.compressedAt, 1000);
});

test("appendFloatingMessage retains only the configured recent-message limit", () => {
  let session = createFloatingSession({ id: "s", pageUrl: "https://example.com" }, 100);
  for (let index = 0; index <= FLOATING_SESSION_MESSAGE_LIMIT; index += 1) {
    session = appendFloatingMessage(session, { role: "user", content: `m${index}` }, 100 + index);
  }
  assert.equal(session.messages.length, FLOATING_SESSION_MESSAGE_LIMIT);
  assert.equal(session.messages[0].content, "m1");
});

test("buildFloatingSourcePrompt marks screenshot context", () => {
  assert.match(buildFloatingSourcePrompt({ type: "screenshot" }), /截图/);
  assert.match(buildFloatingSourcePrompt({ type: "selection", text: "abc" }), /abc/);
});
