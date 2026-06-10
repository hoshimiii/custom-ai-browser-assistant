import { MAX_PAGE_CHARS, MAX_SELECTION_CHARS } from "./defaults.js";

export function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateText(text, maxChars) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}\n\n[内容已截断，原文长度 ${normalized.length} 字符]`;
}

export function preparePageText(text) {
  return truncateText(text, MAX_PAGE_CHARS);
}

export function prepareSelectionText(text) {
  return truncateText(text, MAX_SELECTION_CHARS);
}

export function extractSearchQuery(locationHref, documentTitle = "") {
  try {
    const url = new URL(locationHref);
    const host = url.hostname.toLowerCase();
    if (host.includes("google.")) {
      return url.searchParams.get("q") || "";
    }
    if (host.includes("bing.")) {
      return url.searchParams.get("q") || "";
    }
  } catch {
    return documentTitle.replace(/ - Google Search$| - Bing$/i, "").trim();
  }
  return "";
}

export function getHostnameLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
