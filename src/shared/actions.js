export const PAGE_ACTIONS = Object.freeze([
  {
    id: "summary",
    label: "总结页面",
    prompt: "请总结当前网页。"
  },
  {
    id: "key-points",
    label: "关键要点",
    prompt: "请提取当前网页的关键要点、重要数据和专有名词。"
  },
  {
    id: "todos",
    label: "提取待办",
    prompt: "请从当前网页中提取行动项、待办、风险和截止时间。"
  },
  {
    id: "critique",
    label: "批判分析",
    prompt: "请批判性分析当前网页的论点、证据强度、潜在偏见和需要核实的信息。"
  }
]);

export const SELECTION_ACTIONS = Object.freeze([
  { id: "explain", label: "解释" },
  { id: "translate", label: "翻译" },
  { id: "summarize", label: "总结" },
  { id: "rewrite", label: "改写" },
  { id: "continue", label: "续写" }
]);

export const WRITING_ACTIONS = Object.freeze([
  { id: "polish", label: "润色" },
  { id: "shorten", label: "缩短" },
  { id: "expand", label: "扩写" },
  { id: "formal", label: "正式" },
  { id: "translate", label: "翻译" }
]);

export function findPageAction(id) {
  return PAGE_ACTIONS.find((action) => action.id === id) || PAGE_ACTIONS[0];
}

export function findSelectionAction(id) {
  return SELECTION_ACTIONS.find((action) => action.id === id) || SELECTION_ACTIONS[0];
}

export function findWritingAction(id) {
  return WRITING_ACTIONS.find((action) => action.id === id) || WRITING_ACTIONS[0];
}
