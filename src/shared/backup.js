import { DEFAULT_SETTINGS } from "./defaults.js";
import { normalizeModelSettings } from "./modelInstances.js";
import { mergePageRecipes } from "./pageRecipes.js";

export const BACKUP_VERSION = 1;

export function createBackupPayload(data, exportedAt = new Date().toISOString(), options = {}) {
  return {
    version: BACKUP_VERSION,
    exportedAt,
    app: "custom-ai-browser-assistant",
    settings: normalizeSettingsForBackup(data.settings || {}, options),
    history: Array.isArray(data.history) ? data.history : [],
    savedPages: Array.isArray(data.savedPages) ? data.savedPages : [],
    floatingSessions: Array.isArray(data.floatingSessions) ? data.floatingSessions : [],
    pageRecipes: mergePageRecipes([], data.pageRecipes || [])
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
  return createBackupPayload(payload, payload.exportedAt, { includeApiKey: true });
}

export function mergeBackupPayload(current, backup, mode = "merge") {
  const raw = typeof backup === "string" ? JSON.parse(backup) : backup;
  const parsed = parseBackupPayload(backup);
  if (mode === "replace") {
    return parsed;
  }
  const mergedSettings = mergeSettings(current.settings || {}, parsed.settings || {}, !Array.isArray(raw?.settings?.modelInstances));
  return createBackupPayload({
    settings: mergedSettings,
    history: mergeById(current.history || [], parsed.history || []),
    savedPages: mergeById(current.savedPages || [], parsed.savedPages || []),
    floatingSessions: mergeById(current.floatingSessions || [], parsed.floatingSessions || []),
    pageRecipes: mergePageRecipes(current.pageRecipes || [], parsed.pageRecipes || [])
  }, parsed.exportedAt, { includeApiKey: true });
}

function normalizeSettingsForBackup(settings, options = {}) {
  const normalized = normalizeModelSettings(settings);
  return {
    ...DEFAULT_SETTINGS,
    ...normalized,
    apiKey: options.includeApiKey ? normalized.apiKey : "",
    ttsApiKey: options.includeApiKey ? normalized.ttsApiKey || "" : "",
    modelInstances: normalized.modelInstances.map((instance) => ({ ...instance, apiKey: options.includeApiKey ? instance.apiKey : "" }))
  };
}

function mergeSettings(current, incoming, incomingIsLegacy) {
  const currentSettings = normalizeModelSettings(current);
  const incomingSettings = normalizeModelSettings(incoming);
  if (incomingIsLegacy || (incomingSettings.modelInstances.every((item) => item.id.startsWith("legacy-model-")) && currentSettings.modelInstances.every((item) => item.id.startsWith("legacy-model-")))) {
    const defaultInstance = currentSettings.modelInstances.find((item) => item.id === currentSettings.defaultModelInstanceId);
    const legacyInstance = incomingSettings.modelInstances.find((item) => item.id === incomingSettings.defaultModelInstanceId);
    return normalizeModelSettings({
      ...currentSettings,
      ...incomingSettings,
      apiKey: defaultInstance.apiKey,
      ttsApiKey: incomingSettings.ttsApiKey || currentSettings.ttsApiKey,
      modelInstances: currentSettings.modelInstances.map((item) => item.id === defaultInstance.id ? {
        ...item,
        ...legacyInstance,
        id: item.id,
        apiKey: legacyInstance.apiKey || item.apiKey
      } : item),
      defaultModelInstanceId: currentSettings.defaultModelInstanceId
    });
  }
  const currentById = new Map(currentSettings.modelInstances.map((item) => [item.id, item]));
  const incomingIds = new Set(incomingSettings.modelInstances.map((item) => item.id));
  const modelInstances = [
    ...incomingSettings.modelInstances.map((instance) => ({
      ...instance,
      apiKey: instance.apiKey || currentById.get(instance.id)?.apiKey || ""
    })),
    ...currentSettings.modelInstances.filter((instance) => !incomingIds.has(instance.id))
  ];
  const defaultModelInstanceId = modelInstances.some((item) => item.id === incomingSettings.defaultModelInstanceId)
    ? incomingSettings.defaultModelInstanceId
    : currentSettings.defaultModelInstanceId;
  return normalizeModelSettings({
    ...currentSettings,
    ...incomingSettings,
    ttsApiKey: incomingSettings.ttsApiKey || currentSettings.ttsApiKey,
    modelInstances,
    defaultModelInstanceId
  });
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
