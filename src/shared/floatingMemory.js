export const FLOATING_IDLE_COMPRESSION_MS = 5 * 60 * 1000;
export const FLOATING_SESSION_LIMIT = 120;
export const FLOATING_SESSION_MESSAGE_LIMIT = 40;
export const FLOATING_CONTEXT_CHARS = 6000;

export function normalizeFloatingPageKey(url) {
  try {
    const current = new URL(url);
    return `${current.origin}${current.pathname}${current.search}`;
  } catch {
    return String(url || "unknown-page").slice(0, 500);
  }
}

export function createFloatingSession(input, now = Date.now()) {
  const pageUrl = input.pageUrl || "";
  return {
    id: input.id || crypto.randomUUID(),
    pageKey: normalizeFloatingPageKey(pageUrl),
    pageUrl,
    pageTitle: input.pageTitle || "",
    title: input.title || buildFloatingSessionTitle(input.source),
    source: sanitizeFloatingSource(input.source || {}),
    memorySummary: input.memorySummary || "",
    messages: Array.isArray(input.messages) ? input.messages : [],
    createdAt: input.createdAt || now,
    updatedAt: now,
    lastActivityAt: now,
    compressedAt: input.compressedAt || 0
  };
}

export function upsertFloatingSession(sessions, session) {
  return [
    session,
    ...sessions.filter((item) => item.id !== session.id)
  ]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, FLOATING_SESSION_LIMIT);
}

export function mergeConversationHistory(history, floatingSessions) {
  return [
    ...(history || []).map((conversation) => ({ kind: "conversation", record: conversation })),
    ...(floatingSessions || []).map((session) => ({ kind: "floating", record: session }))
  ].sort((a, b) => latestConversationTime(b.record) - latestConversationTime(a.record));
}

export function appendFloatingMessage(session, message, now = Date.now()) {
  return {
    ...session,
    messages: [
      ...(session.messages || []),
      {
        role: message.role,
        content: String(message.content || ""),
        createdAt: message.createdAt || now
      }
    ].slice(-FLOATING_SESSION_MESSAGE_LIMIT),
    updatedAt: now,
    lastActivityAt: now
  };
}

export function shouldCompressFloatingSession(session, now = Date.now()) {
  const messages = session.messages || [];
  if (messages.length < 6) return false;
  if (session.compressedAt && session.compressedAt >= session.lastActivityAt) return false;
  return now - (session.lastActivityAt || session.updatedAt || 0) >= FLOATING_IDLE_COMPRESSION_MS;
}

export function buildFloatingCompressionPrompt(session) {
  const lines = (session.messages || [])
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");
  return `请把下面网页内浮窗会话压缩为后续继续对话可用的记忆摘要。

要求：
1. 保留用户目标、已确认结论、关键上下文、待办和未解决问题。
2. 删除寒暄、重复内容和无意义过程。
3. 不超过 500 字。

网页标题：${session.pageTitle || "未知"}
网页 URL：${session.pageUrl || "未知"}
已有记忆：
${session.memorySummary || "无"}

会话内容：
${lines}`;
}

export function applyFloatingCompression(session, summary, now = Date.now()) {
  const recent = (session.messages || []).slice(-4);
  return {
    ...session,
    memorySummary: String(summary || "").trim(),
    messages: recent,
    updatedAt: now,
    compressedAt: now
  };
}

export function sanitizeFloatingSource(source) {
  const type = source.type || "page";
  return {
    type,
    label: source.label || source.title || source.type || "网页上下文",
    title: source.title || "",
    text: truncateFloatingText(source.text || ""),
    hasImage: Boolean(source.hasImage || source.imageDataUrl)
  };
}

export function buildFloatingSourcePrompt(source) {
  const safe = sanitizeFloatingSource(source || {});
  if (safe.type === "screenshot") {
    return "本会话源是当前网页截图。首次提问会携带图像；后续问题需要结合已有回答和记忆继续。";
  }
  if (safe.type === "selection") {
    return `本会话源是用户在网页中选中的文本/元素。请优先围绕它回答。

选中内容：
${safe.text}`;
  }
  return `本会话源是当前网页内容。请优先基于网页内容回答。

网页内容摘录：
${safe.text}`;
}

function buildFloatingSessionTitle(source = {}) {
  const safe = sanitizeFloatingSource(source);
  if (safe.type === "screenshot") return "截图会话";
  if (safe.type === "selection") return `选区 · ${safe.text.slice(0, 24) || "文本"}`;
  return "网页会话";
}

function truncateFloatingText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= FLOATING_CONTEXT_CHARS) return normalized;
  return `${normalized.slice(0, FLOATING_CONTEXT_CHARS)}\n\n[已截断 ${normalized.length - FLOATING_CONTEXT_CHARS} 字符]`;
}

function latestConversationTime(record) {
  return Number(record?.updatedAt || record?.createdAt || 0);
}
