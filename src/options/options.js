import { requestChat } from "../shared/apiClient.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";
import { applyProviderPreset, PROVIDER_PRESETS } from "../shared/providers.js";
import { getSettings, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settingsForm");
const status = document.getElementById("status");
const testConnection = document.getElementById("testConnection");

init();

async function init() {
  const settings = await getSettings();
  fillProviderPresets();
  fillForm(settings);
  form.elements.providerPreset.addEventListener("change", () => {
    fillForm(applyProviderPreset(readForm(), form.elements.providerPreset.value));
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(readForm());
    showStatus("已保存。");
  });
  testConnection.addEventListener("click", async () => {
    const settings = readForm();
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
  });
}

function fillForm(settings) {
  for (const [key, value] of Object.entries({ ...DEFAULT_SETTINGS, ...settings })) {
    const input = form.elements[key];
    if (!input) continue;
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value;
    }
  }
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

function readForm() {
  return {
    providerPreset: form.elements.providerPreset.value || DEFAULT_SETTINGS.providerPreset,
    baseUrl: form.elements.baseUrl.value.trim(),
    apiKey: form.elements.apiKey.value.trim(),
    model: form.elements.model.value.trim(),
    targetLanguage: form.elements.targetLanguage.value.trim() || DEFAULT_SETTINGS.targetLanguage,
    timeoutSeconds: Number(form.elements.timeoutSeconds.value || DEFAULT_SETTINGS.timeoutSeconds),
    pageChunkChars: Number(form.elements.pageChunkChars.value || DEFAULT_SETTINGS.pageChunkChars),
    stream: form.elements.stream.checked,
    saveHistory: form.elements.saveHistory.checked,
    systemPrompt: form.elements.systemPrompt.value.trim() || DEFAULT_SETTINGS.systemPrompt
  };
}

function showStatus(message) {
  status.textContent = message;
}
