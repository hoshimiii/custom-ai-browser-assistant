export function detectPageType(url, mimeType = "") {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("pdf")) return "pdf";

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.includes("youtube.com") && path === "/watch") return "youtube";
    if (host === "youtu.be") return "youtube";
    if (host === "www.bilibili.com" && path.startsWith("/video/")) return "bilibili-video";
    if (path.endsWith(".pdf")) return "pdf";
  } catch {
    return "webpage";
  }

  return "webpage";
}

export function buildPageIdentity(tabId, url) {
  let normalizedUrl = String(url || "").trim();
  try {
    normalizedUrl = new URL(normalizedUrl).href;
  } catch {
    // Keep browser-internal or partial URLs comparable without rejecting them.
  }
  return Number.isInteger(tabId) && normalizedUrl ? `${tabId}:${normalizedUrl}` : "";
}

export function buildPageContext(page) {
  const type = page.type || detectPageType(page.url || "");
  if (type === "youtube") {
    return [
      `页面类型：YouTube 视频`,
      `视频标题：${page.title || "无标题"}`,
      `视频 URL：${page.url || "未知"}`,
      page.author ? `频道：${page.author}` : "",
      page.description ? `描述：\n${page.description}` : "",
      page.transcript ? `字幕/转录：\n${page.transcript}` : "",
      page.text ? `页面可见文本：\n${page.text}` : ""
    ].filter(Boolean).join("\n\n");
  }

  if (type === "pdf") {
    return [
      `页面类型：PDF 文档`,
      `标题：${page.title || "无标题"}`,
      `URL：${page.url || "未知"}`,
      page.text ? `可提取文本：\n${page.text}` : "未能直接提取 PDF 文本，请尝试选中文本后使用划词工具，或后续接入 PDF 解析服务。"
    ].join("\n\n");
  }

  if (type === "bilibili-video") {
    return [
      "页面类型：哔哩哔哩视频",
      `视频标题：${page.title || "无标题"}`,
      `视频 URL：${page.url || "未知"}`,
      page.text ? `页面可见文本：\n${page.text}` : ""
    ].filter(Boolean).join("\n\n");
  }

  return [
    `页面类型：网页`,
    `网页标题：${page.title || "无标题"}`,
    `网页 URL：${page.url || "未知"}`,
    `正文：\n${page.text || ""}`
  ].join("\n");
}
