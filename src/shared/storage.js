import { DEFAULT_SETTINGS, HISTORY_LIMIT, SAVED_PAGE_STORAGE_LIMIT } from "./defaults.js";
import { createBackupPayload, mergeBackupPayload } from "./backup.js";
import { removeSavedPageById, upsertSavedPage } from "./library.js";

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

export async function getSavedPages() {
  const saved = await chrome.storage.local.get("savedPages");
  return Array.isArray(saved.savedPages) ? saved.savedPages : [];
}

export async function savePageSnapshot(page) {
  const savedPages = await getSavedPages();
  const next = upsertSavedPage(savedPages, page).slice(0, SAVED_PAGE_STORAGE_LIMIT);
  await chrome.storage.local.set({ savedPages: next });
  return next[0];
}

export async function deleteSavedPage(pageId) {
  const savedPages = await getSavedPages();
  await chrome.storage.local.set({
    savedPages: removeSavedPageById(savedPages, pageId)
  });
}

export async function exportBackup(options = {}) {
  const [settings, history, savedPages] = await Promise.all([
    getSettings(),
    getHistory(),
    getSavedPages()
  ]);
  return createBackupPayload({ settings, history, savedPages }, undefined, options);
}

export async function importBackup(payload, mode = "merge") {
  const current = await exportBackup();
  const next = mergeBackupPayload(current, payload, mode);
  await chrome.storage.local.set({
    settings: next.settings,
    history: next.history,
    savedPages: next.savedPages
  });
  return next;
}
