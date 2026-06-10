import { DEFAULT_SETTINGS } from "./defaults.js";

export const BACKUP_VERSION = 1;

export function createBackupPayload(data, exportedAt = new Date().toISOString()) {
  return {
    version: BACKUP_VERSION,
    exportedAt,
    app: "custom-ai-browser-assistant",
    settings: sanitizeSettings(data.settings || {}),
    history: Array.isArray(data.history) ? data.history : [],
    savedPages: Array.isArray(data.savedPages) ? data.savedPages : []
  };
}

export function parseBackupPayload(raw) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!payload || payload.app !== "custom-ai-browser-assistant") {
    throw new Error("不是有效的 AI Assistant 备份文件");
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${payload.version}`);
  }
  return createBackupPayload(payload, payload.exportedAt);
}

export function mergeBackupPayload(current, backup, mode = "merge") {
  const parsed = parseBackupPayload(backup);
  if (mode === "replace") {
    return parsed;
  }
  return createBackupPayload({
    settings: { ...(current.settings || {}), ...parsed.settings },
    history: mergeById(current.history || [], parsed.history || []),
    savedPages: mergeById(current.savedPages || [], parsed.savedPages || [])
  }, parsed.exportedAt);
}

function sanitizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiKey: settings.apiKey || ""
  };
}

function mergeById(current, incoming) {
  const seen = new Set();
  const merged = [];
  for (const item of [...incoming, ...current]) {
    const key = item.id || item.url || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
