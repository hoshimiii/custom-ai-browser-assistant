function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch {
    return null;
  }
}

export function parseYouTubeVideoUrl(value) {
  const url = parseHttpsUrl(value);
  return url?.hostname === "www.youtube.com" && url.pathname === "/watch" && url.searchParams.get("v") ? url : null;
}

export function parseBilibiliVideoUrl(value) {
  const url = parseHttpsUrl(value);
  const match = url?.hostname === "www.bilibili.com" && url.pathname.match(/^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})\/?$/);
  return match ? { url, bvid: match[1] } : null;
}

export function canonicalizeLocalAsrVideoUrl(value) {
  const authority = /^https:\/\/([^/?#]*)/i.exec(String(value || ""))?.[1]?.split("@").at(-1) || "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || /:\d+$/.test(authority) || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (host === "www.youtube.com" || host === "youtube.com") {
    const videoId = url.pathname === "/watch" ? url.searchParams.get("v") : null;
    return url.searchParams.has("list") || url.searchParams.getAll("v").length !== 1 || !/^[A-Za-z0-9_-]{11}$/.test(videoId || "") ? null : `https://www.youtube.com/watch?v=${videoId}`;
  }
  if (host === "youtu.be") {
    const videoId = /^\/([^/]+)$/.exec(url.pathname)?.[1];
    return url.searchParams.has("list") || !/^[A-Za-z0-9_-]{11}$/.test(videoId || "") ? null : `https://youtu.be/${videoId}`;
  }
  const bilibili = host === "www.bilibili.com" && /^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})\/?$/.exec(url.pathname);
  if (!bilibili || [...url.searchParams.keys()].filter((key) => key === "p").length > 1) return null;
  const part = url.searchParams.get("p");
  return part && !/^[1-9]\d*$/.test(part) ? null : `https://www.bilibili.com/video/${bilibili[1]}${part ? `?p=${part}` : ""}`;
}

export function normalizeYouTubeTimedtextUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== "www.youtube.com" || url.pathname !== "/api/timedtext") return null;
  url.searchParams.set("fmt", "json3");
  return url.href;
}

export function buildBilibiliSubtitleApiUrl(videoUrl, cid) {
  const video = parseBilibiliVideoUrl(videoUrl);
  const normalizedCid = String(cid || "").trim();
  if (!video || !/^\d+$/.test(normalizedCid)) return null;
  const url = new URL("https://api.bilibili.com/x/player/wbi/v2");
  url.searchParams.set("bvid", video.bvid);
  url.searchParams.set("cid", normalizedCid);
  return url.href;
}

export function isBilibiliSubtitleUrl(value) {
  return Boolean(normalizeBilibiliSubtitleUrl(value));
}

export function normalizeBilibiliSubtitleUrl(value) {
  const source = String(value || "").trim();
  const url = parseHttpsUrl(source.startsWith("//aisubtitle.hdslb.com/") ? `https:${source}` : source);
  return url?.hostname === "aisubtitle.hdslb.com" && url.pathname.startsWith("/bfs/") ? url.href : null;
}
