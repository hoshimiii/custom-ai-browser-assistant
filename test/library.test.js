import test from "node:test";
import assert from "node:assert/strict";
import { buildSavedPageQuestionPrompt, normalizeSavedPage, searchSavedPages, upsertSavedPage } from "../src/shared/library.js";

test("normalizeSavedPage assigns stable id and page type", () => {
  const page = normalizeSavedPage({ title: " Demo ", url: "https://youtu.be/abc", text: " hello " }, 100);
  assert.equal(page.type, "youtube");
  assert.equal(page.title, "Demo");
  assert.match(page.id, /^page-/);
});

test("upsertSavedPage deduplicates by url", () => {
  const first = upsertSavedPage([], { title: "A", url: "https://example.com" }, 100);
  const second = upsertSavedPage(first, { title: "B", url: "https://example.com" }, 200);
  assert.equal(second.length, 1);
  assert.equal(second[0].title, "B");
  assert.equal(second[0].updatedAt, 200);
});

test("searchSavedPages ranks title matches before body matches", () => {
  const pages = [
    normalizeSavedPage({ title: "Other", url: "https://a.test", text: "monica" }, 100),
    normalizeSavedPage({ title: "Monica Guide", url: "https://b.test", text: "" }, 200)
  ];
  const results = searchSavedPages(pages, "monica");
  assert.equal(results[0].title, "Monica Guide");
});

test("buildSavedPageQuestionPrompt includes saved context and question", () => {
  const prompt = buildSavedPageQuestionPrompt({ title: "T", url: "u", text: "body" }, "why?");
  assert.match(prompt, /保存的资料/);
  assert.match(prompt, /why\?/);
});
