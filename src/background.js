import { getSettings } from "./shared/storage.js";

const CONTEXT_ACTIONS = [
  { id: "explain", title: "Explain with AI" },
  { id: "translate", title: "Translate with AI" },
  { id: "summarize", title: "Summarize with AI" },
  { id: "rewrite", title: "Rewrite with AI" }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    for (const action of CONTEXT_ACTIONS) {
      chrome.contextMenus.create({
        id: action.id,
        title: action.title,
        contexts: ["selection"]
      });
    }
    chrome.contextMenus.create({
      id: "summarize-page",
      title: "Summarize this page",
      contexts: ["page"]
    });
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
  if (info.menuItemId === "summarize-page") {
    await sendToSidePanel({ type: "PAGE_ACTION", action: "summarize-page", tabId: tab.id });
    return;
  }
  await sendToSidePanel({
    type: "SELECTION_ACTION",
    action: info.menuItemId,
    selectionText: info.selectionText || "",
    tabId: tab.id
  });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.windowId) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
  if (command === "summarize-page" && tab.id) {
    await sendToSidePanel({ type: "PAGE_ACTION", action: "summarize-page", tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  if (message?.type === "GET_SETTINGS_STATUS") {
    const settings = await getSettings();
    return {
      ok: true,
      configured: Boolean(settings.baseUrl && settings.apiKey && settings.model),
      model: settings.model || ""
    };
  }

  if (message?.type === "OPEN_SIDE_PANEL" && sender.tab?.windowId) {
    await chrome.sidePanel.open({ windowId: sender.tab.windowId });
    return { ok: true };
  }

  if (message?.type === "RUN_SELECTION_ACTION") {
    await sendToSidePanel({
      type: "SELECTION_ACTION",
      action: message.action,
      selectionText: message.selectionText,
      tabId: sender.tab?.id
    });
    return { ok: true };
  }

  if (message?.type === "RUN_SEARCH_ACTION") {
    await sendToSidePanel({
      type: "SEARCH_ACTION",
      query: message.query,
      tabId: sender.tab?.id
    });
    return { ok: true };
  }

  return { ok: false, error: "Unknown message" };
}

async function sendToSidePanel(payload) {
  try {
    await chrome.runtime.sendMessage(payload);
  } catch {
    await chrome.storage.session.set({ pendingAction: payload });
  }
}
