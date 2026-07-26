import { ApiError, normalizeBaseUrl, validateBaseUrlPolicy } from "./apiClient.js";
import { splitTextIntoChunks } from "./chunking.js";
import { DEFAULT_SETTINGS } from "./defaults.js";

export const TTS_MAX_CHARS = 3500;
const TTS_INPUT_LIMIT = 4096;

export function resolveTtsSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    baseUrl: normalizeBaseUrl(merged.ttsBaseUrl || merged.baseUrl),
    apiKey: String(merged.ttsApiKey || merged.apiKey || "").trim(),
    model: String(merged.ttsModel || "").trim(),
    voice: String(merged.ttsVoice || "").trim(),
    speed: Number(merged.ttsSpeed),
    timeoutSeconds: Number(merged.ttsTimeoutSeconds)
  };
}

export function splitTtsText(text) {
  return splitTextIntoChunks(text, TTS_MAX_CHARS);
}

export function buildSpeechRequest(settings, input) {
  const resolved = resolveTtsSettings(settings);
  if (!resolved.baseUrl) throw new ApiError("请先配置 TTS API Base URL");
  validateBaseUrlPolicy(resolved.baseUrl);
  if (!resolved.apiKey) throw new ApiError("请先配置 TTS API Key");
  if (!resolved.model) throw new ApiError("请先配置 TTS 模型名称");
  if (!resolved.voice) throw new ApiError("请先配置 TTS 语音");
  if (!Number.isFinite(resolved.speed) || resolved.speed < 0.25 || resolved.speed > 4) {
    throw new ApiError("TTS 速度必须在 0.25 到 4 之间");
  }
  const normalizedInput = String(input || "").trim();
  if (!normalizedInput) throw new ApiError("朗读内容不能为空");
  if (normalizedInput.length > TTS_INPUT_LIMIT) throw new ApiError(`朗读内容不能超过 ${TTS_INPUT_LIMIT} 个字符`);
  return {
    model: resolved.model,
    input: normalizedInput,
    voice: resolved.voice,
    speed: resolved.speed,
    response_format: "mp3"
  };
}

export async function requestSpeech(settings, input, { signal, fetchImpl = fetch } = {}) {
  const resolved = resolveTtsSettings(settings);
  const body = buildSpeechRequest(settings, input);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, Math.max(resolved.timeoutSeconds || 120, 1) * 1000);

  try {
    const response = await fetchImpl(`${resolved.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await safeJson(response);
      throw new ApiError(readErrorMessage(payload, response.statusText), { status: response.status, payload });
    }
    const audio = await response.blob();
    if (!audio || audio.size === 0) throw new ApiError("TTS 返回了空音频");
    return audio;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
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
  return payload?.error?.message || payload?.message || fallback || "TTS 请求失败";
}
