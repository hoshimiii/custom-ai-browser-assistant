import { DEFAULT_SETTINGS, HISTORY_LIMIT } from "./defaults.js";

export async function getSettings() {
  const saved = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...settings }
  });
}

export async function getHistory() {
  const saved = await chrome.storage.local.get("history");
  return Array.isArray(saved.history) ? saved.history : [];
}

export async function saveConversation(conversation) {
  const history = await getHistory();
  const next = [
    {
      id: conversation.id || crypto.randomUUID(),
      title: conversation.title || "Untitled",
      createdAt: conversation.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages: conversation.messages || []
    },
    ...history.filter((item) => item.id !== conversation.id)
  ].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ history: next });
  return next[0];
}

export async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
}
