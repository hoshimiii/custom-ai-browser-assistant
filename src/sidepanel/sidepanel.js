import { streamChat, requestChat } from "../shared/apiClient.js";
import { findPageAction, PAGE_ACTIONS, WRITING_ACTIONS } from "../shared/actions.js";
import { buildChunkSummaryPrompts, buildFinalSummaryPrompt, splitTextIntoChunks } from "../shared/chunking.js";
import { DEFAULT_SETTINGS, MESSAGE_LIMIT } from "../shared/defaults.js";
import { buildSavedPageQuestionPrompt, searchSavedPages } from "../shared/library.js";
import { buildPageQuestionPrompt, buildPageSummaryPrompt, buildSearchPrompt, buildSelectionPrompt, buildWritingPrompt } from "../shared/prompts.js";
import { getHistory, getSavedPages, getSettings, saveConversation, savePageSnapshot } from "../shared/storage.js";
import { buildImageQuestionMessage } from "../shared/vision.js";

const state = {
  settings: DEFAULT_SETTINGS,
  messages: [],
  currentTabId: null,
  running: false,
  abort: null
};

const elements = {
  modelLabel: document.getElementById("modelLabel"),
  messages: document.getElementById("messages"),
  template: document.getElementById("messageTemplate"),
  composer: document.getElementById("composer"),
  promptInput: document.getElementById("promptInput"),
  openOptions: document.getElementById("openOptions"),
  pageActions: document.getElementById("pageActions"),
  writingActions: document.getElementById("writingActions"),
  askScreenshot: document.getElementById("askScreenshot"),
  askPage: document.getElementById("askPage"),
  refreshHistory: document.getElementById("refreshHistory"),
  historyList: document.getElementById("historyList"),
  saveCurrentPage: document.getElementById("saveCurrentPage"),
  librarySearch: document.getElementById("librarySearch"),
  libraryList: document.getElementById("libraryList"),
  clearChat: document.getElementById("clearChat"),
  stopChat: document.getElementById("stopChat")
};

init();

async function init() {
  state.settings = await getSettings();
  updateModelLabel();
  renderActionButtons();
  wireEvents();
  await renderHistory();
  await renderLibrary();
  await consumePendingAction();
  addMessage("assistant", "配置 API 后即可开始使用。可以直接聊天，也可以总结当前网页或处理选中文本。");
}

function wireEvents() {
  elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.promptInput.value.trim();
    if (!text) return;
    elements.promptInput.value = "";
    await sendUserPrompt(text);
  });
  elements.askPage.addEventListener("click", async () => {
    const question = elements.promptInput.value.trim() || window.prompt("请输入关于当前网页的问题");
    if (question) await runPageQuestion(question);
  });
  elements.askScreenshot.addEventListener("click", runScreenshotQuestion);
  elements.refreshHistory.addEventListener("click", renderHistory);
  elements.saveCurrentPage.addEventListener("click", saveCurrentPageToLibrary);
  elements.librarySearch.addEventListener("input", () => renderLibrary(elements.librarySearch.value));
  elements.clearChat.addEventListener("click", () => {
    state.messages = [];
    elements.messages.textContent = "";
  });
  elements.stopChat.addEventListener("click", () => {
    state.abort?.();
    state.running = false;
    elements.stopChat.disabled = true;
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SELECTION_ACTION") {
      runSelectionAction(message.action, message.selectionText);
    }
    if (message?.type === "PAGE_ACTION" && message.action === "summarize-page") {
      runPageAction("summary");
    }
    if (message?.type === "SEARCH_ACTION") {
      runSearchAction(message.query);
    }
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
  addMessage("user", text);
  await askModel([{ role: "user", content: text }]);
}

async function runPageSummary() {
  await runPageAction("summary");
}

async function runPageAction(actionId) {
  const page = await extractCurrentPage();
  if (!page) return;
  const action = findPageAction(actionId);
  addMessage("user", action.label);
  if (action.id === "summary") {
    await summarizePage(page);
  } else {
    await askModel([{ role: "user", content: buildPageQuestionPrompt(page, action.prompt) }]);
  }
}

async function runPageQuestion(question) {
  const page = await extractCurrentPage();
  if (!page) return;
  addMessage("user", question);
  await askModel([{ role: "user", content: buildPageQuestionPrompt(page, question) }]);
}

async function runSelectionAction(action, selectionText) {
  if (!selectionText) return;
  const prompt = buildSelectionPrompt(action, selectionText, state.settings);
  addMessage("user", `处理选中文本：${action}`);
  await askModel([{ role: "user", content: prompt }]);
}

async function runSearchAction(query) {
  if (!query) return;
  addMessage("user", `搜索辅助：${query}`);
  await askModel([{ role: "user", content: buildSearchPrompt(query) }]);
}

async function runScreenshotQuestion() {
  const question = elements.promptInput.value.trim() || window.prompt("请输入关于当前截图的问题，可留空使用默认分析") || "";
  const tab = await getActiveTab();
  if (!tab?.windowId) {
    addMessage("error", "没有可截图的当前窗口。");
    return;
  }
  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const message = buildImageQuestionMessage(imageDataUrl, question);
    addMessage("user", question ? `截图问答：${question}` : "分析当前截图");
    await askModel([message]);
  } catch (error) {
    addMessage("error", `截图失败：${error.message}`);
  }
}

async function saveCurrentPageToLibrary() {
  const page = await extractCurrentPage();
  if (!page) return;
  const saved = await savePageSnapshot(page);
  addMessage("assistant", `已保存到资料库：${saved.title}`);
  await renderLibrary();
}

async function runWritingHelp(action) {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_ACTIVE_EDITABLE" }).catch(() => null);
  const text = response?.editable?.text?.trim();
  if (!text) {
    addMessage("error", "请先聚焦一个输入框，并确保其中有文本。");
    return;
  }
  addMessage("user", "润色当前输入框文本");
  const result = await requestChat(state.settings, buildMessages([{ role: "user", content: buildWritingPrompt(action, text, state.settings) }]));
  await chrome.tabs.sendMessage(tab.id, { type: "REPLACE_ACTIVE_EDITABLE", text: result });
  addMessage("assistant", result);
}

function renderActionButtons() {
  elements.pageActions.textContent = "";
  for (const action of PAGE_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => runPageAction(action.id));
    elements.pageActions.append(button);
  }

  elements.writingActions.textContent = "";
  for (const action of WRITING_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => runWritingHelp(action.id));
    elements.writingActions.append(button);
  }
}

async function askModel(newMessages) {
  if (state.running) return;
  state.running = true;
  elements.stopChat.disabled = false;
  const abortController = new AbortController();
  state.abort = () => abortController.abort();

  const assistantNode = addMessage("assistant", "");
  let fullText = "";
  try {
    const messages = buildMessages(newMessages);
    if (state.settings.stream) {
      await streamChat(state.settings, messages, {
        onToken: (token, total) => {
          fullText = total;
          assistantNode.querySelector(".content").textContent = total;
          scrollToBottom();
        },
        onDone: (text) => {
          fullText = text;
        }
      }, { signal: abortController.signal });
    } else {
      fullText = await requestChat(state.settings, messages);
      assistantNode.querySelector(".content").textContent = fullText;
    }
    if (!fullText) {
      assistantNode.querySelector(".content").textContent = "(无内容)";
    }
    state.messages.push(...newMessages, { role: "assistant", content: fullText });
    trimMessages();
    await persist();
  } catch (error) {
    assistantNode.classList.add("error");
    assistantNode.querySelector(".role").textContent = "ERROR";
    assistantNode.querySelector(".content").textContent = error.message;
  } finally {
    state.running = false;
    state.abort = null;
    elements.stopChat.disabled = true;
  }
}

async function summarizePage(page) {
  const chunks = splitTextIntoChunks(page.text || "", state.settings.pageChunkChars);
  if (chunks.length <= 1) {
    await askModel([{ role: "user", content: buildPageSummaryPrompt(page) }]);
    return;
  }

  addMessage("assistant", `页面较长，正在分 ${chunks.length} 段摘要后汇总。`);
  const chunkPrompts = buildChunkSummaryPrompts(page, state.settings.pageChunkChars);
  const partials = [];
  for (const chunk of chunkPrompts) {
    const partial = await requestChat(state.settings, buildMessages([{ role: "user", content: chunk.prompt }]));
    partials.push(partial);
    addMessage("assistant", `分块 ${chunk.index + 1}/${chunk.total} 摘要完成。`);
  }
  await askModel([{ role: "user", content: buildFinalSummaryPrompt(page, partials) }]);
}

function buildMessages(newMessages) {
  return [
    { role: "system", content: state.settings.systemPrompt },
    ...state.messages.slice(-MESSAGE_LIMIT),
    ...newMessages
  ];
}

async function extractCurrentPage() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    addMessage("error", "没有可读取的当前标签页。");
    return null;
  }
  const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE" }).catch(() => null);
  if (!response?.ok) {
    addMessage("error", "无法读取当前页面。请刷新页面后重试。");
    return null;
  }
  return response.page;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function addMessage(role, content) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".role").textContent = role.toUpperCase();
  node.querySelector(".content").textContent = content;
  elements.messages.appendChild(node);
  scrollToBottom();
  return node;
}

function trimMessages() {
  if (state.messages.length > MESSAGE_LIMIT) {
    state.messages = state.messages.slice(-MESSAGE_LIMIT);
  }
}

async function persist() {
  if (!state.settings.saveHistory) return;
  await saveConversation({
    title: state.messages.find((message) => message.role === "user")?.content?.slice(0, 40) || "Conversation",
    messages: state.messages
  });
  await renderHistory();
}

function scrollToBottom() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function updateModelLabel() {
  elements.modelLabel.textContent = state.settings.model ? `Model: ${state.settings.model}` : "Not configured";
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
      elements.messages.textContent = "";
      for (const message of state.messages) {
        addMessage(message.role, message.content);
      }
    });
    elements.historyList.append(button);
  }
}

async function renderLibrary(query = "") {
  const pages = await getSavedPages();
  const matches = searchSavedPages(pages, query, 8);
  elements.libraryList.textContent = "";
  for (const page of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.textContent = `${page.type || "page"} · ${page.title || "Untitled"}`;
    button.title = page.url || page.title || "";
    button.addEventListener("click", async () => {
      const question = elements.promptInput.value.trim() || window.prompt("基于这条保存资料提问");
      if (!question) return;
      addMessage("user", `资料库问答：${question}`);
      await askModel([{ role: "user", content: buildSavedPageQuestionPrompt(page, question) }]);
    });
    elements.libraryList.append(button);
  }
}
