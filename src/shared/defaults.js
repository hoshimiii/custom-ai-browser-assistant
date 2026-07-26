export const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: "",
  apiKey: "",
  model: "",
  stream: true,
  timeoutSeconds: 120,
  ttsBaseUrl: "",
  ttsApiKey: "",
  ttsModel: "",
  ttsVoice: "alloy",
  ttsSpeed: 1,
  ttsTimeoutSeconds: 120,
  providerPreset: "custom",
  pageChunkChars: 12000,
  targetLanguage: "中文",
  systemPrompt: "你是浏览器中的 AI 助手。回答要准确、简洁、结构清晰，并优先给出可执行建议。",
  saveHistory: true
});

export const HISTORY_LIMIT = 50;

export const SAVED_PAGE_STORAGE_LIMIT = 100;

export const MESSAGE_LIMIT = 20;

export const MAX_PAGE_CHARS = 24000;

export const MAX_SELECTION_CHARS = 8000;
