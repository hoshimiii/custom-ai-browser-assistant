import test from "node:test";
import assert from "node:assert/strict";
import { applyProviderPreset, findProviderPreset, PROVIDER_PRESETS } from "../src/shared/providers.js";

test("provider presets include custom and local options", () => {
  assert.ok(PROVIDER_PRESETS.some((preset) => preset.id === "custom"));
  assert.ok(PROVIDER_PRESETS.some((preset) => preset.id === "ollama"));
});

test("findProviderPreset falls back to custom", () => {
  assert.equal(findProviderPreset("missing").id, "custom");
});

test("applyProviderPreset sets base URL without overwriting existing model", () => {
  const settings = applyProviderPreset({ model: "my-model" }, "openai");
  assert.equal(settings.baseUrl, "https://api.openai.com/v1");
  assert.equal(settings.model, "my-model");
});
