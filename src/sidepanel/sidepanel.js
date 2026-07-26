import { streamChat, requestChat } from "../shared/apiClient.js";
import { findPageAction, PAGE_ACTIONS, WRITING_ACTIONS } from "../shared/actions.js";
import { buildChunkSummaryPrompts, buildFinalSummaryPrompt, splitTextIntoChunks } from "../shared/chunking.js";
import { DEFAULT_SETTINGS, MESSAGE_LIMIT } from "../shared/defaults.js";
import { buildSavedPageQuestionPrompt, searchSavedPages } from "../shared/library.js";
import { buildPagePlannerMessages, parsePagePlannerResponse } from "../shared/pageRecipes.js";
import { buildPageIdentity } from "../shared/pageTypes.js";
import { buildPageQuestionPrompt, buildPageSummaryPrompt, buildSearchPrompt, buildSelectionPrompt, buildWritingPrompt } from "../shared/prompts.js";
import { clearHistory, deletePageRecipe, deleteSavedPage, findStoredPageRecipe, getHistory, getSavedPages, getSettings, saveConversation, savePageRecipe, savePageSnapshot } from "../shared/storage.js";
import { buildInlineTranslationPrompt, parseInlineTranslationResponse } from "../shared/translation.js";
import { buildImageQuestionMessage } from "../shared/vision.js";
import { requestSpeech, splitTtsText } from "../shared/tts.js";
import { resolveModelInstance } from "../shared/modelInstances.js";

const state = {
  settings: DEFAULT_SETTINGS,
  selectedModelInstanceId: null,
  messages: [],
  currentTabId: null,
  context: null,
  contextIdentity: "",
  conversationId: null,
  conversationCreatedAt: null,
  pendingScreenshot: null,
  running: false,
  abort: null,
  busyNoticeShown: false,
  clearHistoryArmed: false,
  tts: {
    chunks: [], index: 0, runToken: 0, abort: null, objectUrl: null, awaitingUserPlayback: false, settings: null
  }
};

const elements = {
  modelSelect: document.getElementById("modelSelect"),
  modelStatus: document.getElementById("modelStatus"),
  messages: document.getElementById("messages"),
  template: document.getElementById("messageTemplate"),
  composer: document.getElementById("composer"),
  promptInput: document.getElementById("promptInput"),
  openOptions: document.getElementById("openOptions"),
  pageActions: document.getElementById("pageActions"),
  writingActions: document.getElementById("writingActions"),
  askScreenshot: document.getElementById("askScreenshot"),
  summarizePage: document.getElementById("summarizePage"),
  readPage: document.getElementById("readPage"),
  selectRegion: document.getElementById("selectRegion"),
  clearRegion: document.getElementById("clearRegion"),
  contextMode: document.getElementById("contextMode"),
  contextDetail: document.getElementById("contextDetail"),
  refreshContext: document.getElementById("refreshContext"),
  hideTranslations: document.getElementById("hideTranslations"),
  showTranslations: document.getElementById("showTranslations"),
  clearTranslations: document.getElementById("clearTranslations"),
  screenshotPanel: document.getElementById("screenshotPanel"),
  screenshotPreview: document.getElementById("screenshotPreview"),
  sendScreenshotQuestion: document.getElementById("sendScreenshotQuestion"),
  analyzeScreenshot: document.getElementById("analyzeScreenshot"),
  retakeScreenshot: document.getElementById("retakeScreenshot"),
  clearScreenshot: document.getElementById("clearScreenshot"),
  refreshHistory: document.getElementById("refreshHistory"),
  clearStoredHistory: document.getElementById("clearStoredHistory"),
  historyList: document.getElementById("historyList"),
  saveCurrentPage: document.getElementById("saveCurrentPage"),
  librarySearch: document.getElementById("librarySearch"),
  libraryList: document.getElementById("libraryList"),
  clearChat: document.getElementById("clearChat"),
  stopChat: document.getElementById("stopChat"),
  ttsStatus: document.getElementById("ttsStatus"),
  ttsMessage: document.getElementById("ttsMessage"),
  ttsProgress: document.getElementById("ttsProgress"),
  ttsAudio: document.getElementById("ttsAudio"),
  stopTts: document.getElementById("stopTts")
};

init();

async function init() {
  state.settings = await getSettings();
  state.selectedModelInstanceId = state.settings.defaultModelInstanceId;
  updateModelSelector();
  renderActionButtons();
  wireEvents();
  await renderHistory();
  await renderLibrary();
  await refreshContextStatus();
  await consumePendingAction();
  addMessage("assistant", "配置 API 后即可开始使用。直接输入问题会默认读取当前网页；也可以选择页面区域、截图问答或网页内翻译。");
}

function wireEvents() {
  elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.modelSelect.addEventListener("change", () => {
    if (!ensureIdle()) {
      elements.modelSelect.value = state.selectedModelInstanceId;
      return;
    }
    state.selectedModelInstanceId = elements.modelSelect.value;
    if (!currentRequestSettings().supportsVision) clearPendingScreenshot();
    updateModelSelector();
  });
  elements.composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.promptInput.value.trim();
    if (!text && !state.pendingScreenshot) return;
    elements.promptInput.value = "";
    if (state.pendingScreenshot) {
      await sendScreenshotQuestion(text);
      return;
    }
    await sendUserPrompt(text);
  });
  elements.summarizePage.addEventListener("click", () => runPageAction("summary"));
  elements.readPage.addEventListener("click", readCurrentPage);
  elements.askScreenshot.addEventListener("click", captureScreenshotForQuestion);
  elements.sendScreenshotQuestion.addEventListener("click", async () => {
    const question = elements.promptInput.value.trim();
    if (!question) {
      addMessage("error", "请先在底部输入框输入截图问题，或点击“直接分析”。");
      elements.promptInput.focus();
      return;
    }
    elements.promptInput.value = "";
    await sendScreenshotQuestion(question);
  });
  elements.analyzeScreenshot.addEventListener("click", () => sendScreenshotQuestion(""));
  elements.retakeScreenshot.addEventListener("click", captureScreenshotForQuestion);
  elements.clearScreenshot.addEventListener("click", clearPendingScreenshot);
  elements.refreshContext.addEventListener("click", refreshContextStatus);
  elements.selectRegion.addEventListener("click", startElementPick);
  elements.clearRegion.addEventListener("click", clearSelectedRegion);
  elements.hideTranslations.addEventListener("click", () => sendActiveTabMessage({ type: "TOGGLE_TRANSLATIONS", hidden: true }));
  elements.showTranslations.addEventListener("click", () => sendActiveTabMessage({ type: "TOGGLE_TRANSLATIONS", hidden: false }));
  elements.clearTranslations.addEventListener("click", clearPageTranslations);
  elements.refreshHistory.addEventListener("click", renderHistory);
  elements.clearStoredHistory.addEventListener("click", handleClearStoredHistory);
  elements.saveCurrentPage.addEventListener("click", saveCurrentPageToLibrary);
  elements.librarySearch.addEventListener("input", () => renderLibrary(elements.librarySearch.value));
  elements.clearChat.addEventListener("click", () => {
    resetConversation();
  });
  elements.stopChat.addEventListener("click", () => {
    state.abort?.();
  });
  elements.stopTts.addEventListener("click", stopTts);
  elements.ttsAudio.addEventListener("play", handleTtsAudioPlay);
  elements.ttsAudio.addEventListener("ended", playNextTtsChunk);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SELECTION_ACTION") {
      runSelectionAction(message.action, message.selectionText, message.frameId);
    }
    if (message?.type === "PAGE_ACTION" && message.action === "summarize-page") {
      runPageAction("summary");
    }
    if (message?.type === "SEARCH_ACTION") {
      runSearchAction(message.query);
    }
    if (message?.type === "REGION_PICK_STARTED") {
      addMessage("assistant", "请在网页上移动鼠标选择区域，点击确认，按 Esc 取消。");
    }
    if (message?.type === "REGION_SELECTED") {
      state.context = {
        mode: "selected-region",
        label: message.region?.label || "选中区域",
        chars: message.region?.chars || 0
      };
      updateContextLabel();
      addMessage("assistant", `已选择页面区域：${state.context.label}`);
    }
    if (message?.type === "REGION_CLEARED") {
      refreshContextStatus();
    }
  });
  chrome.tabs?.onActivated?.addListener(() => refreshContextStatus());
  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (tabId === state.currentTabId && changeInfo.status === "complete") {
      refreshContextStatus();
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.settings) return;
    state.settings = changes.settings.newValue || DEFAULT_SETTINGS;
    if (!state.settings.modelInstances?.some((item) => item.id === state.selectedModelInstanceId)) {
      state.selectedModelInstanceId = state.settings.defaultModelInstanceId;
    }
    if (!currentRequestSettings().supportsVision) clearPendingScreenshot();
    updateModelSelector();
  });
}

async function consumePendingAction() {
  const saved = await chrome.storage.session.get("pendingAction");
  if (saved.pendingAction) {
    await chrome.storage.session.remove("pendingAction");
    chrome.runtime.sendMessage(saved.pendingAction);
  }
}

async function sendUserPrompt(text) {
  if (!ensureIdle()) return;
  const prepared = await preparePageForOperation("page-question", { silent: true });
  if (prepared?.cancelled) return;
  if (prepared?.page?.text?.trim()) {
    addMessage("user", `基于${formatPageScope(prepared.page)}提问：${text}`);
    try {
      await askModelDuringTask([{ role: "user", content: buildPageQuestionPrompt(prepared.page, text) }], prepared.signal, prepared.settings);
    } finally {
      endTask();
    }
    return;
  }
  addMessage("error", "未能读取当前网页内容，本次将按普通聊天发送。可刷新网页或使用“选择区域”后重试。");
  addMessage("user", text);
  await askModel([{ role: "user", content: text }]);
}

async function runPageAction(actionId) {
  if (!ensureIdle()) return;
  const action = findPageAction(actionId);
  if (action.id === "translate-page") {
    await runInlinePageTranslation();
    return;
  }
  const prepared = await preparePageForOperation(action.id);
  if (!prepared?.page) return;
  try {
    addMessage("user", `${action.label}（${formatPageScope(prepared.page)}）`);
    if (action.id === "summary") {
      await summarizePage(prepared.page, prepared.signal, prepared.settings);
    } else {
      await askModelDuringTask([{ role: "user", content: buildPageQuestionPrompt(prepared.page, action.prompt) }], prepared.signal, prepared.settings);
    }
  } finally {
    endTask();
  }
}

async function runSelectionAction(action, selectionText, frameId) {
  if (!selectionText) return;
  if (action === "translate") {
    await translateSelectionInline(selectionText, frameId);
    return;
  }
  if (!ensureIdle()) return;
  const prompt = buildSelectionPrompt(action, selectionText, state.settings);
  addMessage("user", `处理选中文本：${action}`);
  await askModel([{ role: "user", content: prompt }]);
}

async function translateSelectionInline(selectionText, frameId) {
  if (!ensureIdle()) return;
  if (!beginTask()) return;
  const abortController = new AbortController();
  state.abort = () => abortController.abort();
  try {
    addMessage("user", "网页内翻译选中文本");
    const settings = currentRequestSettings();
    const translation = await requestChat(settings, buildMessages([
      { role: "user", content: buildSelectionPrompt("translate", selectionText, settings) }
    ]), { signal: abortController.signal });
    await sendActiveTabMessage({ type: "APPLY_SELECTION_TRANSLATION", translation }, getFrameMessageOptions(frameId));
    addMessage("assistant", translation || "(无内容)");
    state.messages.push(
      { role: "user", content: `翻译选中文本：${selectionText}` },
      { role: "assistant", content: translation }
    );
    trimMessages();
    await persist();
  } catch (error) {
    addMessage("error", `选中文本翻译失败：${error.message}`);
  } finally {
    endTask();
  }
}

async function runSearchAction(query) {
  if (!query) return;
  if (!ensureIdle()) return;
  addMessage("user", `搜索辅助：${query}`);
  await askModel([{ role: "user", content: buildSearchPrompt(query) }]);
}

async function captureScreenshotForQuestion() {
  if (!ensureIdle()) return;
  if (!ensureVisionModel()) return;
  const tab = await getActiveTab();
  if (!tab?.windowId) {
    addMessage("error", "没有可截图的当前窗口。");
    return;
  }
  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    state.pendingScreenshot = imageDataUrl;
    renderScreenshotPreview();
    addMessage("assistant", "已截取当前可视页面。请在底部输入问题后发送，或点击“直接分析”。");
  } catch (error) {
    addMessage("error", `截图失败：${error.message}`);
  }
}

async function sendScreenshotQuestion(question) {
  if (!ensureVisionModel()) return;
  if (!state.pendingScreenshot) {
    await captureScreenshotForQuestion();
    if (!state.pendingScreenshot) return;
  }
  if (!ensureIdle()) return;
  const message = buildImageQuestionMessage(state.pendingScreenshot, question);
  addMessage("user", question ? `截图问答：${question}` : "分析当前截图");
  await askModel([message]);
  clearPendingScreenshot();
}

function renderScreenshotPreview() {
  if (!state.pendingScreenshot) {
    elements.screenshotPanel.hidden = true;
    elements.screenshotPreview.removeAttribute("src");
    return;
  }
  elements.screenshotPreview.src = state.pendingScreenshot;
  elements.screenshotPanel.hidden = false;
}

function clearPendingScreenshot() {
  state.pendingScreenshot = null;
  renderScreenshotPreview();
}

async function saveCurrentPageToLibrary() {
  if (!ensureIdle()) return;
  const prepared = await preparePageForOperation("save");
  if (!prepared?.page) return;
  try {
    const saved = await savePageSnapshot(prepared.page);
    addMessage("assistant", `已保存到资料库：${saved.title}`);
    await renderLibrary();
  } finally {
    endTask();
  }
}

async function runWritingHelp(action) {
  if (!ensureIdle()) return;
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_ACTIVE_EDITABLE" }).catch(() => null);
  const text = response?.editable?.text?.trim();
  if (!text) {
    addMessage("error", "请先聚焦一个输入框，并确保其中有文本。");
    return;
  }
  if (!beginTask()) return;
  const abortController = new AbortController();
  state.abort = () => abortController.abort();
  try {
    addMessage("user", "处理当前输入框文本");
    const settings = currentRequestSettings();
    const result = await requestChat(settings, buildMessages([
      { role: "user", content: buildWritingPrompt(action, text, settings) }
    ]), { signal: abortController.signal });
    await chrome.tabs.sendMessage(tab.id, { type: "REPLACE_ACTIVE_EDITABLE", text: result });
    addMessage("assistant", result);
  } catch (error) {
    addMessage("error", `写作辅助失败：${error.message}`);
  } finally {
    endTask();
  }
}

async function runInlinePageTranslation() {
  if (!ensureIdle()) return;
  const prepared = await preparePageForOperation("translate-page");
  if (!prepared?.page) return;
  try {
    const response = await sendActiveTabMessage({ type: "GET_TRANSLATABLE_BLOCKS", limit: 48, recipeSelectors: prepared.selectors });
    const blocks = response?.blocks || [];
    if (!response?.ok || !blocks.length) {
      addMessage("error", "未找到可翻译的网页正文块。可以先点击“选择区域”限定正文范围。");
      return;
    }
    const batches = buildTranslationBatches(blocks);
    const settings = prepared.settings;
    addMessage("user", `网页内翻译（${response.context?.label || "当前网页"}，${blocks.length} 个文本块）`);
    for (let index = 0; index < batches.length; index += 1) {
      if (prepared.signal.aborted) throw new Error("已停止");
      const batch = batches[index];
      addMessage("assistant", `正在翻译第 ${index + 1}/${batches.length} 批，${batch.length} 个文本块。`);
      const raw = await requestChat(settings, buildMessages([
        { role: "user", content: buildInlineTranslationPrompt(batch, settings) }
      ]), { signal: prepared.signal });
      const translations = parseInlineTranslationResponse(raw);
      await sendActiveTabMessage({ type: "APPLY_TRANSLATIONS", translations });
      addMessage("assistant", `已写入第 ${index + 1}/${batches.length} 批译文。`);
    }
    addMessage("assistant", "网页内翻译完成。可使用“隐藏译文 / 显示译文 / 清除译文”控制页面显示。");
  } catch (error) {
    addMessage("error", `网页内翻译失败：${error.message}`);
  } finally {
    endTask();
  }
}

function buildTranslationBatches(blocks) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const block of blocks) {
    const length = block.text.length;
    if (current.length && (current.length >= 8 || chars + length > 4200)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(block);
    chars += length;
  }
  if (current.length) batches.push(current);
  return batches;
}

function renderActionButtons() {
  elements.pageActions.textContent = "";
  for (const action of PAGE_ACTIONS.filter((item) => item.id !== "summary")) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actionId = action.id;
    button.textContent = action.label;
    button.addEventListener("click", () => runPageAction(action.id));
    elements.pageActions.append(button);
  }

  elements.writingActions.textContent = "";
  for (const action of WRITING_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actionId = action.id;
    button.textContent = action.label;
    button.addEventListener("click", () => runWritingHelp(action.id));
    elements.writingActions.append(button);
  }
}

async function askModel(newMessages) {
  if (!beginTask()) return;
  const abortController = new AbortController();
  state.abort = () => abortController.abort();
  try {
    await askModelDuringTask(newMessages, abortController.signal, currentRequestSettings());
  } finally {
    endTask();
  }
}

async function askModelDuringTask(newMessages, signal, settings = currentRequestSettings()) {
  state.running = true;

  const assistantNode = addMessage("assistant", "");
  let fullText = "";
  try {
    const messages = buildMessages(newMessages);
    if (settings.stream) {
      await streamChat(settings, messages, {
        onToken: (token, total) => {
          fullText = total;
          assistantNode.querySelector(".content").textContent = total;
          scrollToBottom();
        },
        onDone: (text) => {
          fullText = text;
        }
      }, { signal });
    } else {
      fullText = await requestChat(settings, messages, { signal });
      assistantNode.querySelector(".content").textContent = fullText;
    }
    if (!fullText) {
      assistantNode.querySelector(".content").textContent = "(无内容)";
    }
    state.messages.push(...newMessages.map(sanitizeMessageForHistory), { role: "assistant", content: fullText });
    trimMessages();
    await persist();
  } catch (error) {
    assistantNode.classList.add("error");
    assistantNode.querySelector(".role").textContent = "ERROR";
    assistantNode.querySelector(".content").textContent = error.message;
  }
}

async function summarizePage(page, signal, settings) {
  const chunks = splitTextIntoChunks(page.text || "", state.settings.pageChunkChars);
  if (chunks.length <= 1) {
    await askModelDuringTask([{ role: "user", content: buildPageSummaryPrompt(page) }], signal, settings);
    return;
  }
  try {
    addMessage("assistant", `页面较长，正在分 ${chunks.length} 段摘要后汇总。`);
    const chunkPrompts = buildChunkSummaryPrompts(page, state.settings.pageChunkChars);
    const partials = [];
    for (const chunk of chunkPrompts) {
      if (signal.aborted) {
        throw new Error("已停止");
      }
      const partial = await requestChat(settings, buildMessages([{ role: "user", content: chunk.prompt }]), {
        signal
      });
      partials.push(partial);
      addMessage("assistant", `分块 ${chunk.index + 1}/${chunk.total} 摘要完成。`);
    }
    await askModelDuringTask([{ role: "user", content: buildFinalSummaryPrompt(page, partials) }], signal, settings);
  } catch (error) {
    addMessage("error", `长页面摘要失败：${error.message}`);
  }
}

function buildMessages(newMessages) {
  return [
    { role: "system", content: state.settings.systemPrompt },
    ...state.messages.slice(-MESSAGE_LIMIT),
    ...newMessages
  ];
}

async function extractCurrentPage(options = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    if (!options.silent) addMessage("error", "没有可读取的当前标签页。");
    updateUnavailableContext("没有可读取的当前标签页");
    return null;
  }
  syncConversationContext(tab);
  state.currentTabId = tab.id;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE", recipeSelectors: options.recipeSelectors }, { frameId: 0 }).catch(() => null);
  if (!response?.ok || (!response.page?.text && !options.allowEmpty)) {
    if (!options.silent) addMessage("error", "无法读取当前页面。请刷新页面、换到普通网页，或使用“选择区域”后重试。");
    updateUnavailableContext("无法读取当前页面");
    return null;
  }
  const activeTab = await getActiveTab();
  if (buildPageIdentity(activeTab?.id, activeTab?.url) !== buildPageIdentity(tab.id, response.page.url)) {
    return null;
  }
  if (options.recipeSelectors && !response.page.recipe?.valid) return response.page;
  syncConversationContext(tab, response.page.url);
  state.context = {
    mode: response.page.scope === "selected-region" ? "selected-region" : "page",
    label: response.page.scope === "selected-region" ? response.page.selectedRegion?.label || "选中区域" : "当前网页",
    chars: response.page.text.length,
    title: response.page.title,
    url: response.page.url,
    pageType: response.page.type
  };
  updateContextLabel();
  return response.page;
}

async function preparePageForOperation(operation, options = {}) {
  if (!beginTask()) return null;
  const abortController = new AbortController();
  const settings = currentRequestSettings();
  let keepTask = false;
  state.abort = () => abortController.abort();
  try {
    const genericPage = await extractCurrentPage({ silent: options.silent });
    if (!genericPage) return { page: null, cancelled: abortController.signal.aborted };
    if (abortController.signal.aborted) return { page: null, cancelled: true };
    if (genericPage.scope === "selected-region") {
      keepTask = true;
      return { page: genericPage, selectors: [], settings, signal: abortController.signal };
    }
    const planned = await resolvePageRecipe(genericPage, operation, settings, abortController.signal);
    if (abortController.signal.aborted) return { page: null, cancelled: true };
    keepTask = true;
    return planned;
  } catch (error) {
    if (abortController.signal.aborted) {
      addMessage("assistant", "页面规划已停止。");
      return { page: null, cancelled: true };
    }
    addMessage("error", `页面准备失败：${error.message}`);
    return { page: null, cancelled: false };
  } finally {
    if (!keepTask) endTask();
  }
}

async function resolvePageRecipe(genericPage, operation, settings, signal) {
  const stored = await findStoredPageRecipe(genericPage.url, genericPage.type, operation);
  if (stored) {
    const storedPage = await extractCurrentPage({ silent: true, allowEmpty: true, recipeSelectors: stored.selectors });
    if (signal.aborted) throw new DOMException("已停止", "AbortError");
    if (storedPage?.recipe?.valid && storedPage.text) {
      return { page: storedPage, selectors: storedPage.recipe.matchedSelectors, settings, signal };
    }
    if (storedPage) await deletePageRecipe(stored.id);
  }

  const candidateResponse = await sendActiveTabMessage({ type: "GET_PAGE_CANDIDATES" });
  if (!candidateResponse?.ok || !Array.isArray(candidateResponse.candidates) || !candidateResponse.candidates.length) {
    return { page: genericPage, selectors: [], settings, signal };
  }
  const activeTab = await getActiveTab();
  if (buildPageIdentity(activeTab?.id, activeTab?.url) !== buildPageIdentity(state.currentTabId, candidateResponse.page?.url)) {
    throw new Error("页面已切换");
  }

  const status = addMessage("assistant", "正在确定页面正文区域…");
  let candidateIds;
  try {
    const response = await requestChat(settings, buildPagePlannerMessages(genericPage, operation, candidateResponse.candidates), { signal });
    candidateIds = parsePagePlannerResponse(response, candidateResponse.candidates);
  } catch (error) {
    if (signal.aborted) throw error;
    addMessage("assistant", "页面规划不可用，已使用通用网页内容。");
    return { page: genericPage, selectors: [], settings, signal };
  } finally {
    status.remove();
  }
  const selectorById = new Map(candidateResponse.candidates.map((candidate) => [candidate.id, candidate.selector]));
  const selectors = candidateIds.map((id) => selectorById.get(id)).filter(Boolean);
  if (!selectors.length) {
    addMessage("assistant", "页面规划结果无效，已使用通用网页内容。");
    return { page: genericPage, selectors: [], settings, signal };
  }
  const plannedPage = await extractCurrentPage({ silent: true, allowEmpty: true, recipeSelectors: selectors });
  if (!plannedPage?.recipe?.valid || !plannedPage.text) {
    addMessage("assistant", "页面结构已变化，已使用通用网页内容。");
    return { page: genericPage, selectors: [], settings, signal };
  }
  const saved = await savePageRecipe({
    origin: genericPage.url,
    pageType: genericPage.type,
    operation,
    selectors: plannedPage.recipe.matchedSelectors
  });
  return { page: plannedPage, selectors: saved?.selectors || plannedPage.recipe.matchedSelectors, settings, signal };
}

async function refreshContextStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    updateUnavailableContext("没有活动标签页");
    return;
  }
  syncConversationContext(tab);
  state.currentTabId = tab.id;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT_STATUS" }, { frameId: 0 }).catch(() => null);
  if (!response?.ok) {
    updateUnavailableContext("当前页面不可读取");
    return;
  }
  const activeTab = await getActiveTab();
  if (buildPageIdentity(activeTab?.id, activeTab?.url) !== buildPageIdentity(tab.id, response.context?.url)) {
    return;
  }
  syncConversationContext(tab, response.context?.url);
  state.context = response.context;
  updateContextLabel();
}

function updateUnavailableContext(label) {
  state.context = { mode: "unavailable", label, chars: 0 };
  updateContextLabel();
}

function syncConversationContext(tab, url = tab?.url) {
  const nextIdentity = buildPageIdentity(tab?.id, url);
  if (!nextIdentity) return;
  if (state.contextIdentity && state.contextIdentity !== nextIdentity) {
    state.abort?.();
    resetConversation();
    clearPendingScreenshot();
    addMessage("assistant", "页面已切换，已开始新会话，避免混用上一页内容。");
  }
  state.contextIdentity = nextIdentity;
}

function resetConversation() {
  state.messages = [];
  state.conversationId = null;
  state.conversationCreatedAt = null;
  elements.messages.textContent = "";
}

function updateContextLabel() {
  const context = state.context || { mode: "unknown", label: "未读取", chars: 0 };
  const modeLabels = {
    page: "上下文：当前网页",
    "selected-region": "上下文：选中区域",
    unavailable: "上下文：未读取网页",
    unknown: "上下文：未读取"
  };
  elements.contextMode.textContent = modeLabels[context.mode] || "上下文：当前网页";
  const detail = [
    context.label,
    context.pageType ? `类型：${context.pageType}` : "",
    context.chars ? `${context.chars} 字符` : "",
    context.title ? context.title : ""
  ].filter(Boolean).join(" · ");
  elements.contextDetail.textContent = detail;
  elements.clearRegion.disabled = state.running || context.mode !== "selected-region";
}

async function startElementPick() {
  const response = await sendActiveTabMessage({ type: "START_ELEMENT_PICK" });
  if (!response?.ok) {
    addMessage("error", "无法启动区域选择。请刷新页面或切换到普通网页后重试。");
  }
}

async function clearSelectedRegion() {
  await sendActiveTabMessage({ type: "CLEAR_SELECTED_REGION" });
  await refreshContextStatus();
  addMessage("assistant", "已取消选中区域，后续将使用当前网页上下文。");
}

async function clearPageTranslations() {
  await sendActiveTabMessage({ type: "CLEAR_TRANSLATIONS" });
  addMessage("assistant", "已清除当前页面译文。");
}

async function sendActiveTabMessage(message, options = undefined) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;
  return chrome.tabs.sendMessage(tab.id, message, options ?? { frameId: 0 }).catch(() => null);
}

function getFrameMessageOptions(frameId) {
  return Number.isInteger(frameId) ? { frameId } : undefined;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function formatPageScope(page) {
  return page.scope === "selected-region" ? "选中区域" : "当前网页";
}

function addMessage(role, content) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".role").textContent = role.toUpperCase();
  node.querySelector(".content").textContent = formatMessageContent(content);
  elements.messages.appendChild(node);
  scrollToBottom();
  return node;
}

function formatMessageContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part?.type === "text") return part.text;
        if (part?.type === "image_url") return "[截图]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content || "");
}

function sanitizeMessageForHistory(message) {
  if (!Array.isArray(message?.content)) return message;
  return {
    ...message,
    content: formatMessageContent(message.content)
  };
}

function trimMessages() {
  if (state.messages.length > MESSAGE_LIMIT) {
    state.messages = state.messages.slice(-MESSAGE_LIMIT);
  }
}

async function persist() {
  if (!state.settings.saveHistory) return;
  const conversation = await saveConversation({
    id: state.conversationId,
    createdAt: state.conversationCreatedAt,
    title: formatMessageContent(state.messages.find((message) => message.role === "user")?.content).slice(0, 40) || "Conversation",
    messages: state.messages
  });
  state.conversationId = conversation.id;
  state.conversationCreatedAt = conversation.createdAt;
  await renderHistory();
}

function scrollToBottom() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function currentRequestSettings() {
  return resolveModelInstance(state.settings, state.selectedModelInstanceId);
}

function updateModelSelector() {
  const settings = currentRequestSettings();
  elements.modelSelect.textContent = "";
  for (const instance of state.settings.modelInstances || []) {
    const option = document.createElement("option");
    option.value = instance.id;
    option.textContent = `${instance.name}${instance.model ? ` · ${instance.model}` : ""}${instance.supportsVision ? " · Vision" : " · Text"}${instance.id === state.settings.defaultModelInstanceId ? " · Default" : ""}`;
    elements.modelSelect.append(option);
  }
  elements.modelSelect.value = state.selectedModelInstanceId;
  elements.modelSelect.disabled = state.running;
  elements.modelStatus.textContent = settings.model ? `${settings.supportsVision ? "Vision enabled" : "Text only"} · ${settings.model}` : "Not configured";
  updateScreenshotControls();
}

function ensureVisionModel() {
  if (currentRequestSettings().supportsVision) return true;
  clearPendingScreenshot();
  addMessage("error", "当前模型不支持截图问答。");
  return false;
}

function updateScreenshotControls() {
  const disabled = state.running || !currentRequestSettings().supportsVision;
  for (const element of [elements.askScreenshot, elements.sendScreenshotQuestion, elements.analyzeScreenshot, elements.retakeScreenshot]) {
    element.disabled = disabled;
  }
}

function ensureIdle() {
  if (!state.running) return true;
  if (!state.busyNoticeShown) {
    addMessage("error", "已有任务正在运行，请等待完成或点击停止。");
    state.busyNoticeShown = true;
  }
  return false;
}

function beginTask() {
  if (!ensureIdle()) return false;
  state.running = true;
  state.busyNoticeShown = false;
  elements.stopChat.disabled = false;
  setControlsDisabled(true);
  return true;
}

function endTask() {
  state.running = false;
  state.abort = null;
  state.busyNoticeShown = false;
  elements.stopChat.disabled = true;
  setControlsDisabled(false);
}

function setControlsDisabled(disabled) {
  for (const button of document.querySelectorAll("button")) {
    if (button === elements.stopChat || button === elements.stopTts || button === elements.openOptions) continue;
    button.disabled = disabled;
  }
  elements.promptInput.disabled = disabled;
  elements.librarySearch.disabled = disabled;
  elements.modelSelect.disabled = disabled;
  updateScreenshotControls();
  updateContextLabel();
}

async function readCurrentPage() {
  if (!ensureIdle()) return;
  const prepared = await preparePageForOperation("read");
  if (!prepared?.page?.text?.trim()) return;
  try {
    const chunks = splitTtsText(prepared.page.text);
    if (!chunks.length) return;
    stopTts();
    const tts = state.tts;
    tts.chunks = chunks;
    tts.index = 0;
    tts.runToken += 1;
    tts.abort = new AbortController();
    tts.awaitingUserPlayback = false;
    tts.settings = prepared.settings;
    elements.ttsStatus.hidden = false;
    elements.stopTts.disabled = false;
    elements.ttsProgress.max = chunks.length;
    elements.ttsProgress.value = 0;
    setTtsStatus(`正在生成第 1/${chunks.length} 段朗读…`);
  } finally {
    endTask();
  }
  await playNextTtsChunk();
}

async function playNextTtsChunk() {
  const tts = state.tts;
  const token = tts.runToken;
  if (!tts.abort || tts.abort.signal.aborted || tts.awaitingUserPlayback) return;
  if (tts.index >= tts.chunks.length) {
    elements.ttsProgress.value = tts.chunks.length;
    elements.stopTts.disabled = true;
    setTtsStatus("朗读完成。");
    return;
  }
  const number = tts.index + 1;
  setTtsStatus(`正在生成第 ${number}/${tts.chunks.length} 段朗读…`);
  try {
    const audioBlob = await requestSpeech(tts.settings, tts.chunks[tts.index], { signal: tts.abort.signal });
    if (token !== tts.runToken || tts.abort.signal.aborted) return;
    revokeTtsAudio();
    tts.objectUrl = URL.createObjectURL(audioBlob);
    elements.ttsAudio.src = tts.objectUrl;
    elements.ttsAudio.load();
    tts.index += 1;
    elements.ttsProgress.value = tts.index;
    setTtsStatus(`正在播放第 ${number}/${tts.chunks.length} 段朗读…`);
    try {
      await elements.ttsAudio.play();
    } catch {
      if (token !== tts.runToken || tts.abort.signal.aborted) return;
      tts.awaitingUserPlayback = true;
      setTtsStatus(`第 ${number}/${tts.chunks.length} 段已生成，点击播放器播放。`);
    }
  } catch (error) {
    if (token !== tts.runToken || tts.abort?.signal.aborted) return;
    tts.abort.abort();
    elements.stopTts.disabled = true;
    setTtsStatus(`朗读失败：${error.message}`);
  }
}

function handleTtsAudioPlay() {
  const tts = state.tts;
  if (!tts.awaitingUserPlayback || !tts.abort || tts.abort.signal.aborted) return;
  tts.awaitingUserPlayback = false;
  setTtsStatus(`正在播放第 ${tts.index}/${tts.chunks.length} 段朗读…`);
}

function stopTts() {
  const tts = state.tts;
  const active = tts.abort || tts.objectUrl;
  tts.runToken += 1;
  tts.abort?.abort();
  tts.abort = null;
  tts.chunks = [];
  tts.index = 0;
  tts.awaitingUserPlayback = false;
  tts.settings = null;
  elements.ttsAudio.pause();
  elements.ttsAudio.currentTime = 0;
  revokeTtsAudio();
  elements.stopTts.disabled = true;
  if (active) setTtsStatus("朗读已停止。");
}

function revokeTtsAudio() {
  if (state.tts.objectUrl) URL.revokeObjectURL(state.tts.objectUrl);
  state.tts.objectUrl = null;
  elements.ttsAudio.removeAttribute("src");
  elements.ttsAudio.load();
}

function setTtsStatus(message) {
  elements.ttsMessage.textContent = message;
}

async function renderHistory() {
  const history = await getHistory();
  elements.historyList.textContent = "";
  for (const conversation of history.slice(0, 8)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.textContent = conversation.title || "Untitled";
    button.addEventListener("click", () => {
      state.messages = conversation.messages || [];
      state.conversationId = conversation.id;
      state.conversationCreatedAt = conversation.createdAt || null;
      elements.messages.textContent = "";
      for (const message of state.messages) {
        addMessage(message.role, message.content);
      }
    });
    elements.historyList.append(button);
  }
}

async function handleClearStoredHistory() {
  if (!state.clearHistoryArmed) {
    state.clearHistoryArmed = true;
    elements.clearStoredHistory.textContent = "再次点击确认";
    addMessage("assistant", "再次点击“再次点击确认”会清空本地会话历史。");
    window.setTimeout(() => {
      state.clearHistoryArmed = false;
      elements.clearStoredHistory.textContent = "清空记录";
    }, 5000);
    return;
  }
  state.clearHistoryArmed = false;
  elements.clearStoredHistory.textContent = "清空记录";
  await clearHistory();
  await renderHistory();
  addMessage("assistant", "本地会话历史已清空。");
}

async function renderLibrary(query = "") {
  const pages = await getSavedPages();
  const matches = searchSavedPages(pages, query, 8);
  elements.libraryList.textContent = "";
  for (const page of matches) {
    const row = document.createElement("div");
    row.className = "library-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.textContent = `${page.type || "page"} · ${page.title || "Untitled"}`;
    button.title = page.url || page.title || "";
    button.addEventListener("click", async () => {
      const question = elements.promptInput.value.trim();
      if (!question) {
        addMessage("error", "请先在底部输入框输入资料库问题。");
        elements.promptInput.focus();
        return;
      }
      elements.promptInput.value = "";
      addMessage("user", `资料库问答：${question}`);
      await askModel([{ role: "user", content: buildSavedPageQuestionPrompt(page, question) }]);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "library-delete";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", async () => {
      await deleteSavedPage(page.id);
      await renderLibrary(elements.librarySearch.value);
    });
    row.append(button, deleteButton);
    elements.libraryList.append(row);
  }
}
