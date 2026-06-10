import { normalizeWhitespace } from "./text.js";

export function splitTextIntoChunks(text, maxChars = 12000) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongParagraph(paragraph, maxChars));
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function buildChunkSummaryPrompts(page, maxChars = 12000) {
  const chunks = splitTextIntoChunks(page.text || "", maxChars);
  return chunks.map((chunk, index) => ({
    index,
    total: chunks.length,
    prompt: `请总结网页分块 ${index + 1}/${chunks.length}，保留事实、数据、专有名词和行动项。

网页标题：${page.title || "无标题"}
网页 URL：${page.url || "未知"}
分块内容：
${chunk}`
  }));
}

export function buildFinalSummaryPrompt(page, partialSummaries) {
  return `请整合以下网页分块摘要，输出：
1. 一句话结论
2. 关键要点
3. 重要数据、术语或引用
4. 风险、限制或不确定信息
5. 可执行建议

网页标题：${page.title || "无标题"}
网页 URL：${page.url || "未知"}
分块摘要：
${partialSummaries.map((summary, index) => `## 分块 ${index + 1}\n${summary}`).join("\n\n")}`;
}

function splitLongParagraph(paragraph, maxChars) {
  const chunks = [];
  for (let index = 0; index < paragraph.length; index += maxChars) {
    chunks.push(paragraph.slice(index, index + maxChars));
  }
  return chunks;
}
