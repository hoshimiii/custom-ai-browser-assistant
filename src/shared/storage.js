import { HISTORY_LIMIT, SAVED_PAGE_STORAGE_LIMIT } from "./defaults.js";
import { createBackupPayload, mergeBackupPayload } from "./backup.js";
import { normalizeFloatingPageKey, upsertFloatingSession } from "./floatingMemory.js";
import { removeSavedPageById, upsertSavedPage } from "./library.js";
import { normalizeModelSettings } from "./modelInstances.js";
import { findPageRecipe, mergePageRecipes, normalizePageRecipe, removePageRecipe, upsertPageRecipe } from "./pageRecipes.js";

export async function getSettings() {
  const saved = await chrome.storage.local.get("settings");
  const settings = normalizeModelSettings(saved.settings || {});
  if (JSON.stringify(settings) !== JSON.stringify(saved.settings || {})) await chrome.storage.local.set({ settings });
  return settings;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings: normalizeModelSettings(settings) });
}

export async function getPageRecipes() {
  const saved = await chrome.storage.local.get("pageRecipes");
  const pageRecipes = mergePageRecipes([], saved.pageRecipes || []);
  if (JSON.stringify(pageRecipes) !== JSON.stringify(saved.pageRecipes || [])) await chrome.storage.local.set({ pageRecipes });
  return pageRecipes;
}

export async function findStoredPageRecipe(origin, pageType, operation) {
  return findPageRecipe(await getPageRecipes(), origin, pageType, operation);
}

export async function savePageRecipe(recipe) {
  if (!normalizePageRecipe(recipe)) return null;
  const pageRecipes = upsertPageRecipe(await getPageRecipes(), recipe);
  await chrome.storage.local.set({ pageRecipes });
  return pageRecipes[0] || null;
}

export async function deletePageRecipe(recipeId) {
  await chrome.storage.local.set({ pageRecipes: removePageRecipe(await getPageRecipes(), recipeId) });
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

export async function getFloatingSessions() {
  const saved = await chrome.storage.local.get("floatingSessions");
  return Array.isArray(saved.floatingSessions) ? saved.floatingSessions : [];
}

export async function getFloatingSessionsForPage(pageUrl) {
  const pageKey = normalizeFloatingPageKey(pageUrl);
  const sessions = await getFloatingSessions();
  return sessions.filter((session) => session.pageKey === pageKey);
}

export async function saveFloatingSession(session) {
  const sessions = await getFloatingSessions();
  const next = upsertFloatingSession(sessions, session);
  await chrome.storage.local.set({ floatingSessions: next });
  return session;
}

export async function exportBackup(options = {}) {
  const [settings, history, savedPages, floatingSessions, pageRecipes] = await Promise.all([
    getSettings(),
    getHistory(),
    getSavedPages(),
    getFloatingSessions(),
    getPageRecipes()
  ]);
  return createBackupPayload({ settings, history, savedPages, floatingSessions, pageRecipes }, undefined, options);
}

export async function importBackup(payload, mode = "merge") {
  const current = await exportBackup({ includeApiKey: true });
  const next = mergeBackupPayload(current, payload, mode);
  await chrome.storage.local.set({
    settings: next.settings,
    history: next.history,
    savedPages: next.savedPages,
    floatingSessions: next.floatingSessions,
    pageRecipes: next.pageRecipes
  });
  return next;
}
