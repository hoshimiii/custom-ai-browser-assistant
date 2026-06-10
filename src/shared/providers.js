export const PROVIDER_PRESETS = Object.freeze([
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    modelHint: "your-model-name"
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelHint: "gpt-4.1-mini"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelHint: "openai/gpt-4.1-mini"
  },
  {
    id: "ollama",
    label: "Ollama OpenAI endpoint",
    baseUrl: "http://127.0.0.1:11434/v1",
    modelHint: "qwen2.5:7b"
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    modelHint: "local-model"
  },
  {
    id: "newapi",
    label: "One API / New API",
    baseUrl: "http://127.0.0.1:3000/v1",
    modelHint: "configured-model"
  }
]);

export function findProviderPreset(id) {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) || PROVIDER_PRESETS[0];
}

export function applyProviderPreset(settings, presetId) {
  const preset = findProviderPreset(presetId);
  return {
    ...settings,
    providerPreset: preset.id,
    baseUrl: preset.baseUrl || settings.baseUrl || "",
    model: settings.model || preset.modelHint || ""
  };
}
