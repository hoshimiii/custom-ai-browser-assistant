import { preparePageText, prepareSelectionText } from "./text.js";
import { buildPageContext } from "./pageTypes.js";

export function buildPageSummaryPrompt(page) {
  return `请总结当前网页，输出：
1. 一句话结论
2. 5 条关键要点
3. 重要数据、术语或引用
4. 对用户可能有用的行动建议

网页标题：${page.title || "无标题"}
网页 URL：${page.url || "未知"}
内容：
${preparePageText(buildPageContext(page))}`;
}

export function buildPageQuestionPrompt(page, question) {
  return `请只基于当前网页内容回答用户问题。如果网页没有提供答案，请明确说明无法从网页确认。

网页标题：${page.title || "无标题"}
网页 URL：${page.url || "未知"}
网页内容：
${preparePageText(buildPageContext(page))}

用户问题：
${question}`;
}

export function buildSelectionPrompt(action, selection, options = {}) {
  const text = prepareSelectionText(selection);
  const language = options.targetLanguage || "中文";
  const tone = options.tone || "清晰、自然、专业";
  const prompts = {
    explain: `请解释下面选中文本。先给简明解释，再补充必要背景。\n\n选中文本：\n${text}`,
    translate: `请把下面文本翻译成${language}，保持原意、术语和格式。\n\n选中文本：\n${text}`,
    summarize: `请总结下面选中文本，输出核心观点和关键信息。\n\n选中文本：\n${text}`,
    rewrite: `请将下面文本改写为${tone}风格，保留核心含义，不要添加未经提供的事实。\n\n选中文本：\n${text}`,
    continue: `请自然续写下面文本，保持语气和上下文一致。\n\n文本：\n${text}`
  };
  return prompts[action] || prompts.explain;
}

export function buildSearchPrompt(query) {
  return `请针对下面搜索词给出简洁的背景说明、可能答案、进一步检索关键词和注意事项。如果问题需要最新信息，请提醒用户核对来源。

搜索词：
${query}`;
}

export function buildWritingPrompt(action, text, options = {}) {
  const language = options.targetLanguage || "中文";
  const prompts = {
    polish: `请润色下面文本，使其更清晰、自然、专业。只输出润色后的文本。\n\n${text}`,
    shorten: `请缩短下面文本，保留关键意思。只输出改写后的文本。\n\n${text}`,
    expand: `请扩写下面文本，使表达更完整。只输出扩写后的文本。\n\n${text}`,
    formal: `请把下面文本改写为更正式的语气。只输出改写后的文本。\n\n${text}`,
    translate: `请把下面文本翻译成${language}。只输出译文。\n\n${text}`
  };
  return prompts[action] || prompts.polish;
}
