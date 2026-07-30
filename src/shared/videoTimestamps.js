import { canonicalizeLocalAsrVideoUrl } from "./videoUrls.js";

const TIMESTAMP_LABEL = /^\[(?:(\d{2,}):)?(\d{2}):(\d{2})\]$/;

export function parseTimestampLabel(label) {
  const match = TIMESTAMP_LABEL.exec(String(label || ""));
  if (!match) return null;
  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds > 59 || (match[1] !== undefined && minutes > 59)) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(total) ? total : null;
}

export function buildVideoTimestampUrl(videoUrl, seconds) {
  const source = canonicalizeLocalAsrVideoUrl(videoUrl);
  if (!source || !Number.isSafeInteger(seconds) || seconds < 0) return null;
  const url = new URL(source);
  url.searchParams.set("t", String(seconds));
  return url.href;
}

export function parseVideoTimestampLink(markdown) {
  const match = /^\[([^\]]+)]\(([^\s)]+)\)$/.exec(String(markdown || ""));
  if (!match) return null;
  const seconds = parseTimestampLabel(`[${match[1]}]`);
  if (seconds === null) return null;
  const expected = buildVideoTimestampUrl(match[2], seconds);
  return expected && expected === match[2] ? { label: `[${match[1]}]`, seconds, url: expected } : null;
}

export const parseVideoTimestampMarkdownLink = parseVideoTimestampLink;

export function linkifyVideoTimestamps(markdown, videoUrl) {
  if (!canonicalizeLocalAsrVideoUrl(videoUrl)) return String(markdown || "");
  return String(markdown || "").split(/(```[\s\S]*?(?:```|$))/g).map((part) => {
    if (part.startsWith("```")) return part;
    return linkifyText(part, videoUrl);
  }).join("");
}

function linkifyText(text, videoUrl) {
  let output = "";
  for (let index = 0; index < text.length;) {
    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end >= 0) {
        output += text.slice(index, end + 1);
        index = end + 1;
        continue;
      }
    }
    if (text[index] === "[") {
      const labelEnd = balancedEnd(text, index, "[", "]");
      if (labelEnd >= 0 && text[labelEnd + 1] === "(") {
        const linkEnd = balancedEnd(text, labelEnd + 1, "(", ")");
        if (linkEnd >= 0) {
          output += text.slice(index, linkEnd + 1);
          index = linkEnd + 1;
          continue;
        }
      }
      const label = labelEnd >= 0 ? text.slice(index, labelEnd + 1) : "";
      const seconds = parseTimestampLabel(label);
      const url = seconds === null ? null : buildVideoTimestampUrl(videoUrl, seconds);
      if (url) {
        output += `[${label.slice(1, -1)}](${url})`;
        index = labelEnd + 1;
        continue;
      }
    }
    output += text[index++];
  }
  return output;
}

function balancedEnd(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) depth += 1;
    if (text[index] === close && --depth === 0) return index;
  }
  return -1;
}
