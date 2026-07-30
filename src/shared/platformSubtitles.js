import { buildBilibiliSubtitleApiUrl, normalizeBilibiliSubtitleUrl, normalizeYouTubeTimedtextUrl, parseBilibiliVideoUrl, parseYouTubeVideoUrl } from "./videoUrls.js";
import { parseTimestampLabel } from "./videoTimestamps.js";

function textFromSegs(segs) {
  return (Array.isArray(segs) ? segs : []).map((segment) => String(segment?.utf8 || "").trim()).filter(Boolean).join("");
}

function timestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const clock = hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` : String(minutes).padStart(2, "0");
  return `[${clock}:${String(total % 60).padStart(2, "0")}]`;
}

export function parseYouTubeJson3(payload) {
  const lines = (payload?.events || []).map((event) => {
    const text = textFromSegs(event?.segs);
    return text ? `${timestamp((Number(event.tStartMs) || 0) / 1000)} ${text}` : "";
  }).filter(Boolean);
  return lines.join("\n");
}

export function parseBilibiliSubtitle(payload) {
  const lines = (payload?.body || []).map((item) => {
    const text = String(item?.content || "").trim();
    return text ? `${timestamp(item.from)} ${text}` : "";
  }).filter(Boolean);
  return lines.join("\n");
}

export function selectYouTubeTrack(tracks) {
  const valid = (Array.isArray(tracks) ? tracks : []).map((track) => ({ ...track, baseUrl: normalizeYouTubeTimedtextUrl(track?.baseUrl) })).filter((track) => track.baseUrl);
  return valid.find((track) => track.kind !== "asr") || valid.find((track) => track.kind === "asr") || null;
}

export function replaceWithPlatformSubtitle(page, subtitle) {
  return {
    ...page,
    transcript: subtitle.text,
    text: "",
    evidence: {
      kind: "platform-subtitles",
      label: "平台字幕",
      platform: subtitle.platform,
      language: subtitle.language || "未知语言",
      timed: true
    }
  };
}

export function replaceWithLocalAsr(page, transcript) {
  const segmentText = (Array.isArray(transcript?.segments) ? transcript.segments : []).map((segment) => {
    const text = String(segment?.text || "").trim();
    const start = Number(segment?.start);
    return text && Number.isFinite(start) ? `${timestamp(start)} ${text}` : "";
  }).filter(Boolean).join("\n");
  const text = segmentText || String(transcript?.text || "").trim();
  return {
    ...page,
    transcript: text,
    text: "",
    evidence: { kind: "local-asr", label: "Cloudflare ASR（Whisper Large V3 Turbo）", language: transcript?.language || "未知语言", timed: /\[(?:(?:\d{2,}):)?\d{2}:\d{2}\]/g.test(text) && [...text.matchAll(/\[(?:(?:\d{2,}):)?\d{2}:\d{2}\]/g)].some((match) => parseTimestampLabel(match[0]) !== null) }
  };
}

export function describeEvidence(page) {
  const evidence = page?.evidence;
  if (evidence?.kind === "platform-subtitles") return `证据来源：${evidence.label}（${evidence.platform}${evidence.language ? `，${evidence.language}` : ""}${evidence.timed ? "，含时间戳" : ""}）`;
  if (evidence?.kind === "local-asr") return `证据来源：${evidence.label}${evidence.language ? `（${evidence.language}）` : ""}${evidence.timed ? "，含时间戳" : ""}`;
  return page?.transcript?.trim() ? "证据来源：页面可见字幕/转录" : "证据来源：页面可见文本";
}

export async function fetchPlatformSubtitle(page, metadata, { signal, fetchFn = fetch } = {}) {
  try {
    if (parseYouTubeVideoUrl(page?.url)) return await fetchYouTubeSubtitle(metadata, { signal, fetchFn });
    if (parseBilibiliVideoUrl(page?.url)) return await fetchBilibiliSubtitle(page.url, metadata, { signal, fetchFn });
    return null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchYouTubeSubtitle(metadata, { signal, fetchFn }) {
  const track = selectYouTubeTrack(metadata?.youtubeTracks);
  if (!track) return null;
  const response = await fetchFn(track.baseUrl, { credentials: "omit", signal });
  if (!response.ok) return null;
  const text = parseYouTubeJson3(await response.json());
  return text ? { text, platform: "YouTube", language: track.languageCode || track.name?.simpleText || "未知语言" } : null;
}

async function fetchBilibiliSubtitle(pageUrl, metadata, { signal, fetchFn }) {
  const apiUrl = buildBilibiliSubtitleApiUrl(pageUrl, metadata?.bilibiliCid);
  if (!apiUrl) return null;
  const response = await fetchFn(apiUrl, { credentials: "omit", signal });
  if (!response.ok) return null;
  const subtitles = (await response.json())?.data?.subtitle?.subtitles || [];
  const track = subtitles.map((item) => ({ ...item, subtitle_url: normalizeBilibiliSubtitleUrl(item?.subtitle_url) })).find((item) => item.subtitle_url);
  if (!track) return null;
  const subtitleResponse = await fetchFn(track.subtitle_url, { credentials: "omit", signal });
  if (!subtitleResponse.ok) return null;
  const text = parseBilibiliSubtitle(await subtitleResponse.json());
  return text ? { text, platform: "Bilibili", language: track.lan_doc || track.lan || "未知语言" } : null;
}
