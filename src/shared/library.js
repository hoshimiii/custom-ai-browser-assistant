import { buildPageContext, detectPageType } from "./pageTypes.js";
import { normalizeWhitespace } from "./text.js";

export const SAVED_PAGE_LIMIT = 100;

export function normalizeSavedPage(page, now = Date.now()) {
  const url = String(page.url || "").trim();
  return {
    id: page.id || stablePageId(url || page.title || String(now)),
    type: page.type || detectPageType(url),
    title: normalizeWhitespace(page.title || "Untitled").slice(0, 180),
    url,
    author: normalizeWhitespace(page.author || ""),
    description: normalizeWhitespace(page.description || ""),
    transcript: normalizeWhitespace(page.transcript || ""),
    text: normalizeWhitespace(page.text || ""),
    savedAt: page.savedAt || now,
    updatedAt: now
  };
}

export function upsertSavedPage(pages, page, now = Date.now()) {
  const normalized = normalizeSavedPage(page, now);
  const next = [
    normalized,
    ...pages.filter((item) => item.id !== normalized.id && item.url !== normalized.url)
  ];
  return next.slice(0, SAVED_PAGE_LIMIT);
}

export function searchSavedPages(pages, query, limit = 10) {
  const terms = normalizeWhitespace(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return pages.slice(0, limit);
  }

  return pages
    .map((page) => ({ page, score: scorePage(page, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)
    .slice(0, limit)
    .map((item) => item.page);
}

export function removeSavedPageById(pages, pageId) {
  return pages.filter((page) => page.id !== pageId);
}

export function buildSavedPageQuestionPrompt(page, question) {
  return `请只基于下面保存的资料回答用户问题。如果资料中没有答案，请明确说明无法从资料确认。

保存资料：
${buildPageContext(page)}

用户问题：
${question}`;
}

function scorePage(page, terms) {
  const title = `${page.title || ""} ${page.url || ""}`.toLowerCase();
  const body = `${page.description || ""} ${page.transcript || ""} ${page.text || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (body.includes(term)) score += 1;
  }
  return score;
}

function stablePageId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `page-${Math.abs(hash)}`;
}
