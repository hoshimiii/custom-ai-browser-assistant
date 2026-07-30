import test from "node:test";
import assert from "node:assert/strict";
import { createModelInstance, duplicateModelInstance, isGptReasoningModel, normalizeModelSettings, normalizeReasoningEffort, removeModelInstance, resolveModelInstance } from "../src/shared/modelInstances.js";

test("normalizes legacy settings into a stable vision-capable default instance", () => {
  const legacy = { providerPreset: "openai", baseUrl: "https://api.example", apiKey: "key", model: "vision" };
  const first = normalizeModelSettings(legacy);
  const second = normalizeModelSettings(legacy);
  assert.equal(first.modelInstances.length, 1);
  assert.equal(first.modelInstances[0].id, second.modelInstances[0].id);
  assert.equal(first.modelInstances[0].supportsVision, true);
  assert.equal(first.apiKey, "key");
  assert.equal(first.localAsrEnabled, false);
  assert.equal(first.localAsrToken, "");
});

test("repairs an invalid default and resolves a selected instance to flat settings", () => {
  const settings = normalizeModelSettings({
    defaultModelInstanceId: "missing",
    modelInstances: [
      { id: "one", name: "One", model: "text", supportsVision: false },
      { id: "two", name: "Two", model: "vision", supportsVision: true }
    ]
  });
  assert.equal(settings.defaultModelInstanceId, "one");
  assert.equal(settings.model, "text");
  assert.equal(resolveModelInstance(settings, "two").model, "vision");
  assert.equal(resolveModelInstance(settings, "missing").model, "text");
});

test("creates blank non-vision instances, duplicates with a new ID, and refuses sole removal", () => {
  const initial = normalizeModelSettings({ modelInstances: [{ id: "one", name: "One", apiKey: "secret", model: "m", supportsVision: true }], defaultModelInstanceId: "one" });
  const created = createModelInstance(initial, () => "two");
  assert.equal(created.modelInstances[1].supportsVision, false);
  const duplicated = duplicateModelInstance(initial, "one", () => "copy");
  assert.deepEqual(duplicated.modelInstances[1], { ...initial.modelInstances[0], id: "copy", name: "One（副本）" });
  assert.deepEqual(removeModelInstance(initial, "one"), initial);
  assert.equal(removeModelInstance(duplicated, "one").defaultModelInstanceId, "copy");
});

test("normalizes, duplicates, and resolves per-instance GPT reasoning effort", () => {
  const settings = normalizeModelSettings({ modelInstances: [
    { id: "gpt", name: "GPT", model: "openai/GPT-5", reasoningEffort: "HIGH" },
    { id: "other", name: "Other", model: "other/model", reasoningEffort: "invalid" }
  ], defaultModelInstanceId: "gpt" });
  assert.equal(settings.modelInstances[0].reasoningEffort, "high");
  assert.equal(settings.modelInstances[1].reasoningEffort, "");
  assert.equal(resolveModelInstance(settings, "gpt").reasoningEffort, "high");
  assert.equal(resolveModelInstance({ modelInstances: [{ id: "other", model: "other/model", reasoningEffort: "high" }], defaultModelInstanceId: "other" }).reasoningEffort, "");
  assert.equal(duplicateModelInstance(settings, "gpt", () => "copy").modelInstances[2].reasoningEffort, "high");
  assert.equal(normalizeReasoningEffort("xhigh"), "xhigh");
  assert.equal(normalizeReasoningEffort("none"), "none");
  assert.equal(normalizeReasoningEffort("minimal"), "minimal");
  assert.equal(normalizeReasoningEffort("invalid"), "");
  assert.equal(isGptReasoningModel("openai/gPt-5.4"), true);
  assert.equal(isGptReasoningModel("gpt-4o"), false);
  assert.equal(isGptReasoningModel("gpt-audio"), false);
  assert.equal(isGptReasoningModel("gpt-image"), false);
  assert.equal(isGptReasoningModel("gpt-5-audio"), false);
  assert.equal(isGptReasoningModel("openai/gpt-5-image"), false);
  assert.equal(isGptReasoningModel("gpt-5-mini"), true);
  assert.equal(isGptReasoningModel("gpt-5/other"), false);
});
