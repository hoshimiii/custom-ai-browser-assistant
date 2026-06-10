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
  return {
    model: overrides.model || settings.model,
    stream: overrides.stream ?? settings.stream ?? true,
    temperature: overrides.temperature ?? 0.3,
    messages
  };
}

export async function requestChat(settings, messages, overrides = {}) {
  const body = buildChatRequest(settings, messages, { ...overrides, stream: false });
  const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: overrides.signal
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, response.statusText), {
      status: response.status,
      payload
    });
  }
  return payload?.choices?.[0]?.message?.content || "";
}

export async function streamChat(settings, messages, callbacks = {}, overrides = {}) {
  const body = buildChatRequest(settings, messages, { ...overrides, stream: true });
  const controller = new AbortController();
  const signal = overrides.signal || controller.signal;
  const timeoutMs = Math.max(Number(settings.timeoutSeconds || 120), 1) * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
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
      const text = payload?.choices?.[0]?.message?.content || "";
      callbacks.onToken?.(text);
      callbacks.onDone?.(text);
      return { abort: () => controller.abort() };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        if (event === "[DONE]") {
          callbacks.onDone?.(fullText);
          return;
        }
        const token = readDeltaContent(event);
        if (token) {
          fullText += token;
          callbacks.onToken?.(token, fullText);
        }
      }
    }
    callbacks.onDone?.(fullText);
  } finally {
    clearTimeout(timeout);
  }
}

export function consumeSseBuffer(buffer) {
  const parts = buffer.split(/\n\n/);
  const remainder = parts.pop() || "";
  const events = [];
  for (const part of parts) {
    const dataLines = part
      .split(/\n/)
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
    return payload?.choices?.[0]?.delta?.content || "";
  } catch {
    return "";
  }
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
