import { DEFAULT_SETTINGS } from "./defaults.js";

const LEGACY_FIELDS = ["providerPreset", "baseUrl", "apiKey", "model"];
const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

export function normalizeReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  return REASONING_EFFORTS.has(effort) ? effort : "";
}

export function isGptReasoningModel(model) {
  const segment = String(model || "").trim().split("/").at(-1) || "";
  return /^gpt-5(?:$|[.-])/i.test(segment) && !/(?:^|[.-])(audio|image)(?:$|[.-])/i.test(segment);
}

export function normalizeModelSettings(settings = {}) {
  const raw = settings && typeof settings === "object" ? settings : {};
  const instances = Array.isArray(raw.modelInstances)
    ? raw.modelInstances.map((instance, index) => normalizeInstance(instance, index)).filter(Boolean)
    : [legacyInstance(raw)];
  const modelInstances = uniqueIds(instances.length ? instances : [blankInstance()]);
  const defaultModelInstanceId = modelInstances.some((item) => item.id === raw.defaultModelInstanceId)
    ? raw.defaultModelInstanceId
    : modelInstances[0].id;
  const defaultInstance = modelInstances.find((item) => item.id === defaultModelInstanceId);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    modelInstances,
    defaultModelInstanceId,
    ...flatInstance(defaultInstance)
  };
}

export function resolveModelInstance(settings, selectedId) {
  const normalized = normalizeModelSettings(settings);
  const instance = normalized.modelInstances.find((item) => item.id === selectedId)
    || normalized.modelInstances.find((item) => item.id === normalized.defaultModelInstanceId);
  return { ...normalized, ...flatInstance(instance) };
}

export function createModelInstance(settings, idGenerator = () => crypto.randomUUID()) {
  const normalized = normalizeModelSettings(settings);
  return normalizeModelSettings({
    ...normalized,
    modelInstances: [...normalized.modelInstances, blankInstance(idGenerator())]
  });
}

export function duplicateModelInstance(settings, instanceId, idGenerator = () => crypto.randomUUID()) {
  const normalized = normalizeModelSettings(settings);
  const source = normalized.modelInstances.find((item) => item.id === instanceId);
  if (!source) return normalized;
  return normalizeModelSettings({
    ...normalized,
    modelInstances: [...normalized.modelInstances, { ...source, id: idGenerator(), name: `${source.name}（副本）` }]
  });
}

export function removeModelInstance(settings, instanceId) {
  const normalized = normalizeModelSettings(settings);
  if (normalized.modelInstances.length === 1 || !normalized.modelInstances.some((item) => item.id === instanceId)) return normalized;
  const modelInstances = normalized.modelInstances.filter((item) => item.id !== instanceId);
  return normalizeModelSettings({
    ...normalized,
    modelInstances,
    defaultModelInstanceId: normalized.defaultModelInstanceId === instanceId ? modelInstances[0].id : normalized.defaultModelInstanceId
  });
}

function legacyInstance(raw) {
  const hasLegacyFields = LEGACY_FIELDS.some((field) => Object.hasOwn(raw, field));
  if (!hasLegacyFields) return blankInstance();
  return {
    id: stableModelInstanceId(raw),
    name: String(raw.name || raw.model || "默认模型").trim() || "默认模型",
    providerPreset: String(raw.providerPreset || "custom"),
    baseUrl: String(raw.baseUrl || ""),
    apiKey: String(raw.apiKey || ""),
    model: String(raw.model || ""),
    reasoningEffort: normalizeReasoningEffort(raw.reasoningEffort),
    supportsVision: true
  };
}

function normalizeInstance(instance, index) {
  if (!instance || typeof instance !== "object") return null;
  const id = String(instance.id || "").trim();
  return {
    id: id || `model-${index + 1}`,
    name: String(instance.name || instance.model || `模型 ${index + 1}`).trim() || `模型 ${index + 1}`,
    providerPreset: String(instance.providerPreset || "custom"),
    baseUrl: String(instance.baseUrl || ""),
    apiKey: String(instance.apiKey || ""),
    model: String(instance.model || ""),
    reasoningEffort: normalizeReasoningEffort(instance.reasoningEffort),
    supportsVision: Boolean(instance.supportsVision)
  };
}

function blankInstance(id = "model-default") {
  return { id, name: "默认模型", providerPreset: "custom", baseUrl: "", apiKey: "", model: "", reasoningEffort: "", supportsVision: false };
}

function flatInstance(instance) {
  return {
    providerPreset: instance.providerPreset,
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    model: instance.model,
    reasoningEffort: isGptReasoningModel(instance.model) ? instance.reasoningEffort : "",
    supportsVision: instance.supportsVision
  };
}

function uniqueIds(instances) {
  const ids = new Set();
  return instances.map((instance, index) => {
    let id = instance.id;
    while (ids.has(id)) id = `${instance.id}-${index + 1}`;
    ids.add(id);
    return { ...instance, id };
  });
}

function stableModelInstanceId(settings) {
  const value = [settings.providerPreset, settings.baseUrl, settings.model].map((item) => String(item || "")).join("|");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return `legacy-model-${Math.abs(hash)}`;
}
