import { requestChat } from "../shared/apiClient.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";
import { createModelInstance, duplicateModelInstance, isGptReasoningModel, normalizeModelSettings, removeModelInstance, resolveModelInstance } from "../shared/modelInstances.js";
import { applyProviderPreset, PROVIDER_PRESETS } from "../shared/providers.js";
import { exportBackup, getSettings, importBackup, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settingsForm");
const status = document.getElementById("status");
const instanceList = document.getElementById("modelInstanceList");
const testConnection = document.getElementById("testConnection");
const exportBackupButton = document.getElementById("exportBackup");
const importBackupInput = document.getElementById("importBackup");
const replaceOnImport = document.getElementById("replaceOnImport");
const includeApiKeyInBackup = document.getElementById("includeApiKeyInBackup");
let draftSettings;
let selectedInstanceId;
let dirty = false;

init();

async function init() {
  fillProviderPresets();
  loadDraft(await getSettings());
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("change", (event) => { if (event.target !== instanceList) dirty = true; });
  instanceList.addEventListener("change", () => {
    syncEditorToDraft();
    selectedInstanceId = instanceList.value;
    renderForm();
  });
  form.elements.providerPreset.addEventListener("change", () => {
    syncEditorToDraft();
    updateSelectedInstance(applyProviderPreset(selectedInstance(), form.elements.providerPreset.value));
    renderForm();
  });
  form.elements.model.addEventListener("input", () => updateReasoningEffortVisibility());
  document.getElementById("addModelInstance").addEventListener("click", () => {
    syncEditorToDraft();
    draftSettings = createModelInstance(draftSettings);
    selectedInstanceId = draftSettings.modelInstances.at(-1).id;
    dirty = true;
    renderForm();
  });
  document.getElementById("duplicateModelInstance").addEventListener("click", () => {
    syncEditorToDraft();
    draftSettings = duplicateModelInstance(draftSettings, selectedInstanceId);
    selectedInstanceId = draftSettings.modelInstances.at(-1).id;
    dirty = true;
    renderForm();
  });
  document.getElementById("setDefaultModelInstance").addEventListener("click", () => {
    syncEditorToDraft();
    draftSettings = normalizeModelSettings({ ...draftSettings, defaultModelInstanceId: selectedInstanceId });
    dirty = true;
    renderForm();
  });
  document.getElementById("deleteModelInstance").addEventListener("click", () => {
    syncEditorToDraft();
    if (draftSettings.modelInstances.length === 1) return;
    draftSettings = removeModelInstance(draftSettings, selectedInstanceId);
    selectedInstanceId = draftSettings.modelInstances.some((item) => item.id === selectedInstanceId)
      ? selectedInstanceId
      : draftSettings.defaultModelInstanceId;
    dirty = true;
    renderForm();
  });
  form.addEventListener("submit", handleSave);
  testConnection.addEventListener("click", handleTest);
  exportBackupButton.addEventListener("click", handleExportBackup);
  importBackupInput.addEventListener("change", handleImportBackup);
}

function loadDraft(settings, preferredId) {
  draftSettings = normalizeModelSettings(settings);
  selectedInstanceId = draftSettings.modelInstances.some((item) => item.id === preferredId)
    ? preferredId
    : draftSettings.defaultModelInstanceId;
  dirty = false;
  renderForm();
}

function renderForm() {
  const instance = selectedInstance();
  instanceList.textContent = "";
  for (const item of draftSettings.modelInstances) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} — ${item.model || "未设置模型"}${item.id === draftSettings.defaultModelInstanceId ? "（默认）" : ""}`;
    option.selected = item.id === selectedInstanceId;
    instanceList.append(option);
  }
  fillFields(instance, ["modelInstanceName", "providerPreset", "baseUrl", "apiKey", "model", "reasoningEffort", "supportsVision"], {
    modelInstanceName: instance.name
  });
  updateReasoningEffortVisibility(instance.model);
  fillFields(draftSettings, ["targetLanguage", "timeoutSeconds", "ttsBaseUrl", "ttsApiKey", "ttsModel", "ttsVoice", "ttsSpeed", "ttsTimeoutSeconds", "pageChunkChars", "stream", "saveHistory", "systemPrompt"]);
  document.getElementById("deleteModelInstance").disabled = draftSettings.modelInstances.length === 1;
  document.getElementById("setDefaultModelInstance").disabled = selectedInstanceId === draftSettings.defaultModelInstanceId;
}

function fillFields(values, keys, aliases = {}) {
  for (const key of keys) {
    const input = form.elements[key];
    if (input.type === "checkbox") input.checked = Boolean(values[key]);
    else input.value = aliases[key] ?? values[key] ?? "";
  }
}

function selectedInstance() {
  return draftSettings.modelInstances.find((item) => item.id === selectedInstanceId) || draftSettings.modelInstances[0];
}

function syncEditorToDraft() {
  const globals = readGlobalFields();
  const instance = {
    ...selectedInstance(),
    name: form.elements.modelInstanceName.value.trim() || selectedInstance().name,
    providerPreset: form.elements.providerPreset.value || DEFAULT_SETTINGS.providerPreset,
    baseUrl: form.elements.baseUrl.value.trim(),
    apiKey: form.elements.apiKey.value.trim(),
    model: form.elements.model.value.trim(),
    reasoningEffort: form.elements.reasoningEffort.value,
    supportsVision: form.elements.supportsVision.checked
  };
  draftSettings = normalizeModelSettings({
    ...draftSettings,
    ...globals,
    modelInstances: draftSettings.modelInstances.map((item) => item.id === selectedInstanceId ? instance : item)
  });
}

function updateReasoningEffortVisibility(model = form.elements.model.value) {
  document.getElementById("reasoningEffortField").hidden = !isGptReasoningModel(model);
}

function updateSelectedInstance(instance) {
  draftSettings = normalizeModelSettings({
    ...draftSettings,
    modelInstances: draftSettings.modelInstances.map((item) => item.id === selectedInstanceId ? instance : item)
  });
}

function fillProviderPresets() {
  form.elements.providerPreset.textContent = "";
  for (const preset of PROVIDER_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    form.elements.providerPreset.append(option);
  }
}

function readGlobalFields() {
  return {
    targetLanguage: form.elements.targetLanguage.value.trim() || DEFAULT_SETTINGS.targetLanguage,
    timeoutSeconds: Number(form.elements.timeoutSeconds.value || DEFAULT_SETTINGS.timeoutSeconds),
    ttsBaseUrl: form.elements.ttsBaseUrl.value.trim(),
    ttsApiKey: form.elements.ttsApiKey.value.trim(),
    ttsModel: form.elements.ttsModel.value.trim(),
    ttsVoice: form.elements.ttsVoice.value.trim() || DEFAULT_SETTINGS.ttsVoice,
    ttsSpeed: Number(form.elements.ttsSpeed.value || DEFAULT_SETTINGS.ttsSpeed),
    ttsTimeoutSeconds: Number(form.elements.ttsTimeoutSeconds.value || DEFAULT_SETTINGS.ttsTimeoutSeconds),
    pageChunkChars: Number(form.elements.pageChunkChars.value || DEFAULT_SETTINGS.pageChunkChars),
    stream: form.elements.stream.checked,
    saveHistory: form.elements.saveHistory.checked,
    systemPrompt: form.elements.systemPrompt.value.trim() || DEFAULT_SETTINGS.systemPrompt
  };
}

async function handleSave(event) {
  event.preventDefault();
  syncEditorToDraft();
  const selectedId = selectedInstanceId;
  await saveSettings(draftSettings);
  loadDraft(await getSettings(), selectedId);
  showStatus("已保存。");
}

async function handleTest() {
  syncEditorToDraft();
  const settings = resolveModelInstance(draftSettings, selectedInstanceId);
  showStatus("测试中...");
  try {
    const text = await requestChat(settings, [
      { role: "system", content: settings.systemPrompt },
      { role: "user", content: "请回复：连接成功" }
    ]);
    showStatus(`连接成功：${text.slice(0, 80)}`);
  } catch (error) {
    showStatus(`连接失败：${error.message}`);
  }
}

function showStatus(message) { status.textContent = message; }

async function handleExportBackup() {
  const payload = await exportBackup({ includeApiKey: includeApiKeyInBackup.checked });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus(includeApiKeyInBackup.checked ? "已导出备份，文件包含 API Key，请只保存在可信位置。" : "已导出备份，未包含 API Key。");
}

async function handleImportBackup() {
  const file = importBackupInput.files?.[0];
  if (!file) return;
  if (dirty && !confirm("当前未保存的设置将丢失，继续导入吗？")) { importBackupInput.value = ""; return; }
  try {
    const selectedId = selectedInstanceId;
    await importBackup(JSON.parse(await file.text()), replaceOnImport.checked ? "replace" : "merge");
    loadDraft(await getSettings(), selectedId);
    showStatus("导入完成。");
  } catch (error) {
    showStatus(`导入失败：${error.message}`);
  } finally {
    importBackupInput.value = "";
  }
}
