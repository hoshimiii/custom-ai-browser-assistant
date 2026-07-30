import { canonicalizeLocalAsrVideoUrl } from "./videoUrls.js";

export const LOCAL_ASR_BASE_URL = "http://127.0.0.1:8765/v1";
const JOB_ID = /^[a-f0-9]{32}$/;
const ACTIVE = new Set(["queued", "downloading", "transcribing"]);
const CODES = {
  UNAUTHORIZED: "Cloudflare 视频转写助手令牌无效。", BUSY: "Cloudflare 视频转写助手正在处理其他视频。",
  DEPENDENCY_MISSING: "Cloudflare 视频转写助手依赖尚未安装。", UNSUPPORTED_URL: "该视频链接不受 Cloudflare 视频转写支持。",
  UNSUPPORTED_DURATION: "视频时长不受 Cloudflare 视频转写支持。", DOWNLOAD_FAILED: "Cloudflare 视频转写助手无法下载该视频音频。",
  TRANSCRIBE_FAILED: "Cloudflare 视频转写失败。", PROCESSING_FAILED: "Cloudflare 视频转写助手处理失败。", CANCELLED: "Cloudflare 视频转写已停止。",
  NOT_FOUND: "Cloudflare 视频转写任务已失效。", WEAK_TOKEN: "Cloudflare 视频转写助手令牌格式无效。", INVALID_URL: "该视频链接不受 Cloudflare 视频转写支持。",
  INVALID_REQUEST: "Cloudflare 视频转写请求无效。", REQUEST_TOO_LARGE: "Cloudflare 视频转写请求过大。", UNSUPPORTED_MEDIA_TYPE: "Cloudflare 视频转写请求格式无效。",
  PRIORITY_SETUP_FAILED: "Cloudflare 视频转写助手无法设置低优先级。",
  INVALID_CLOUDFLARE_CONFIGURATION: "Cloudflare ASR 配置无效。", CLOUDFLARE_AUTH_FAILED: "Cloudflare ASR 认证失败。",
  CLOUDFLARE_RATE_LIMITED: "Cloudflare ASR 当前限流，请稍后重试。", CLOUDFLARE_UNAVAILABLE: "Cloudflare ASR 暂时不可用，请稍后重试。",
  FFMPEG_MISSING: "Cloudflare 视频转写助手缺少 FFmpeg。", AUDIO_PREPARE_FAILED: "视频音频准备失败。", AUDIO_TOO_LARGE: "音频分段超过 Cloudflare ASR 限制。"
};

export class LocalAsrError extends Error {
  constructor(message) { super(message); this.name = "LocalAsrError"; }
}

export function localAsrErrorMessage(code) { return CODES[code] || "Cloudflare 视频转写助手返回了无效响应。"; }

export async function testLocalAsrHealth(token, options = {}) {
  const data = await request("/health", { token, fetchFn: options.fetchFn, signal: options.signal });
  if (data?.status !== "ok" || Object.keys(data).length !== 1) throw new LocalAsrError("Cloudflare 视频转写助手返回了无效响应。");
  return true;
}

export async function transcribeWithLocalAsr(url, token, options = {}) {
  const canonicalUrl = canonicalizeLocalAsrVideoUrl(url);
  if (!canonicalUrl) throw new LocalAsrError("该视频链接不受 Cloudflare 视频转写支持。");
  const { signal, fetchFn, pollIntervalMs = 1000, sleepFn = delay } = options;
  throwIfAborted(signal);
  const created = await request("/jobs", { method: "POST", body: { url: canonicalUrl }, token, fetchFn, signal, expectedStatus: 202 });
  if (!JOB_ID.test(created?.id || "") || !ACTIVE.has(created.status) || Object.keys(created).some((key) => key !== "id" && key !== "status")) throw new LocalAsrError("Cloudflare 视频转写助手返回了无效响应。");
  const jobId = created.id;
  try {
    while (true) {
      throwIfAborted(signal);
      const job = await request(`/jobs/${jobId}`, { token, fetchFn, signal });
      if (job?.id !== jobId || typeof job.status !== "string") throw new LocalAsrError("Cloudflare 视频转写助手返回了无效响应。");
      if (ACTIVE.has(job.status) && Object.keys(job).every((key) => key === "id" || key === "status")) {
        await sleepFn(pollIntervalMs, signal);
        continue;
      }
      if (job.status === "completed" && isTranscript(job.transcript)) return job.transcript;
      if ((job.status === "failed" || job.status === "cancelled") && typeof job.error === "string") throw new LocalAsrError(localAsrErrorMessage(job.error));
      throw new LocalAsrError("Cloudflare 视频转写助手返回了无效响应。");
    }
  } catch (error) {
    if (signal?.aborted) void cancelJob(jobId, token, fetchFn);
    throw error;
  }
}

async function cancelJob(jobId, token, fetchFn) {
  try { await request(`/jobs/${jobId}`, { method: "DELETE", token, fetchFn, expectedStatus: 202 }); } catch { /* best effort */ }
}

async function request(path, { method = "GET", body, token, fetchFn = fetch, signal, expectedStatus = 200 } = {}) {
  if (!String(token || "").trim()) throw new LocalAsrError("请先在设置中填写 Cloudflare 视频转写助手令牌。");
  let response;
  try {
    response = await fetchFn(`${LOCAL_ASR_BASE_URL}${path}`, {
      method, signal, headers: { "Content-Type": "application/json", "X-Local-Asr-Token": token }, body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw error;
    throw new LocalAsrError("Cloudflare 视频转写助手不可用。");
  }
  let data;
  try { data = await response.json(); } catch { throw new LocalAsrError("Cloudflare 视频转写助手返回了无效响应。"); }
  if (response.status !== expectedStatus) throw new LocalAsrError(localAsrErrorMessage(data?.error?.code));
  return data;
}

function isTranscript(value) {
  return value && typeof value === "object" && typeof value.text === "string" && value.text.length > 0 && value.text.length <= 2_000_000
    && typeof value.language === "string" && Array.isArray(value.segments) && value.segments.length <= 100_000;
}

function throwIfAborted(signal) { if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError"); }
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    let id;
    const finish = (callback, value) => { clearTimeout(id); signal?.removeEventListener("abort", onAbort); callback(value); };
    const onAbort = () => finish(reject, signal.reason || new DOMException("Aborted", "AbortError"));
    id = setTimeout(() => finish(resolve), ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
