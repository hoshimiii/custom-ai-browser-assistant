import { isGptReasoningModel, normalizeReasoningEffort } from "./modelInstances.js";

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = details.status || 0;
    this.payload = details.payload;
  }
}

export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

export function sameCredentialEndpoint(left, right) {
  const first = normalizeBaseUrl(left);
  const second = normalizeBaseUrl(right);
  if (!first || !second) return first === second;
  try {
    const a = new URL(first);
    const b = new URL(second);
    return ["http:", "https:"].includes(a.protocol) && a.href === b.href;
  } catch {
    return false;
  }
}

export function buildChatCompletionsUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new ApiError("请先配置 API Base URL");
  }
  return `${normalized}/chat/completions`;
}

export function validateSettings(settings) {
  const normalized = normalizeBaseUrl(settings.baseUrl);
  if (!normalized) {
    throw new ApiError("请先配置 API Base URL");
  }
  validateBaseUrlPolicy(normalized);
  if (!String(settings.apiKey || "").trim()) {
    throw new ApiError("请先配置 API Key");
  }
  if (!String(settings.model || "").trim()) {
    throw new ApiError("请先配置模型名称");
  }
}

export function validateBaseUrlPolicy(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ApiError("API Base URL 不是有效 URL");
  }
  const hostname = parsed.hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (parsed.protocol === "http:" && !isLocal) {
    throw new ApiError("远程 API Base URL 必须使用 HTTPS；HTTP 仅允许 localhost/127.0.0.1");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError("API Base URL 仅支持 HTTP 或 HTTPS");
  }
}

export function buildChatRequest(settings, messages, overrides = {}) {
  validateSettings(settings);
  const model = overrides.model || settings.model;
  const reasoningEffort = normalizeReasoningEffort(settings.reasoningEffort);
  return {
    model,
    stream: overrides.stream ?? settings.stream ?? true,
    temperature: overrides.temperature ?? 0.3,
    messages,
    ...(isGptReasoningModel(model) && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };
}

export async function requestChat(settings, messages, overrides = {}) {
  const body = buildChatRequest(settings, messages, { ...overrides, stream: false });
  const request = createRequestController(settings, overrides.signal);
  try {
    const response = await (overrides.fetchImpl || fetch)(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: request.signal
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new ApiError(readErrorMessage(payload, response.statusText), {
        status: response.status,
        payload
      });
    }
    return requireUsableText(readResponseText(payload));
  } finally {
    request.cleanup();
  }
}

export async function streamChat(settings, messages, callbacks = {}, overrides = {}) {
  const body = buildChatRequest(settings, messages, { ...overrides, stream: true });
  const request = createRequestController(settings, overrides.signal);

  try {
    const response = await (overrides.fetchImpl || fetch)(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: request.signal
    });

    if (!response.ok) {
      const payload = await safeJson(response);
      throw new ApiError(readErrorMessage(payload, response.statusText), {
        status: response.status,
        payload
      });
    }

    if (!response.body) {
      const payload = await response.json();
      const text = requireUsableText(readResponseText(payload));
      callbacks.onToken?.(text);
      callbacks.onDone?.(text);
      return { abort: request.abort };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawBody = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      rawBody += chunk;
      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        if (event === "[DONE]") {
          requireUsableText(fullText);
          callbacks.onDone?.(fullText);
          return { abort: request.abort };
        }
        const token = readDeltaContent(event);
        if (token) {
          fullText += token;
          callbacks.onToken?.(token, fullText);
        }
      }
    }
    const finalChunk = decoder.decode();
    buffer += finalChunk;
    rawBody += finalChunk;
    const parsed = consumeSseBuffer(buffer, true);
    for (const event of parsed.events) {
      if (event === "[DONE]") break;
      const token = readDeltaContent(event);
      if (token) {
        fullText += token;
        callbacks.onToken?.(token, fullText);
      }
    }
    if (!fullText) {
      const text = readJsonResponseText(rawBody);
      if (text) {
        fullText = text;
        callbacks.onToken?.(text, fullText);
      }
    }
    requireUsableText(fullText);
    callbacks.onDone?.(fullText);
    return { abort: request.abort };
  } finally {
    request.cleanup();
  }
}

function createRequestController(settings, externalSignal) {
  const controller = new AbortController();
  const seconds = Number(settings.timeoutSeconds);
  const timeoutMs = Math.max(Number.isFinite(seconds) ? seconds : 120, 1) * 1000;
  const abort = () => controller.abort(new DOMException("已停止", "AbortError"));
  const forwardAbort = () => abort();
  if (externalSignal?.aborted) {
    abort();
  } else {
    externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(new DOMException("请求超时", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    abort,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardAbort);
    }
  };
}

export function consumeSseBuffer(buffer, flush = false) {
  const parts = String(buffer || "").split(/\r?\n\r?\n/);
  const remainder = flush ? "" : (parts.pop() || "");
  if (flush && parts.length === 1 && !parts[0].trim()) parts.length = 0;
  const events = [];
  for (const part of parts) {
    const dataLines = part
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    for (const line of dataLines) {
      if (line) events.push(line);
    }
  }
  return { events, remainder };
}

export function readDeltaContent(event) {
  if (event === "[DONE]") return "";
  try {
    const payload = JSON.parse(event);
    return payload?.type === "response.output_text.delta"
      ? readMessageContent(payload.delta)
      : readMessageContent(payload?.choices?.[0]?.delta?.content);
  } catch {
    return "";
  }
}

function readJsonResponseText(body) {
  try {
    return readResponseText(JSON.parse(body));
  } catch {
    return "";
  }
}

function readResponseText(payload) {
  return readMessageContent(payload?.choices?.[0]?.message?.content)
    || readMessageContent(payload?.output_text)
    || (Array.isArray(payload?.output)
      ? payload.output
        .filter((item) => item?.type === "message")
        .map((item) => readMessageContent(item.content))
        .join("")
      : "");
}

function readMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" || part?.type === "output_text" || (!part?.type && typeof part?.text === "string"))
    .map((part) => String(part.text || ""))
    .join("");
}

function requireUsableText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) throw new ApiError("模型返回了空内容，请检查模型兼容性，或关闭流式输出后重试。");
  return normalized;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback || "请求失败";
}
