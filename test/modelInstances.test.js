import test from "node:test";
import assert from "node:assert/strict";
import { createModelInstance, duplicateModelInstance, normalizeModelSettings, removeModelInstance, resolveModelInstance } from "../src/shared/modelInstances.js";

test("normalizes legacy settings into a stable vision-capable default instance", () => {
  const legacy = { providerPreset: "openai", baseUrl: "https://api.example", apiKey: "key", model: "vision" };
  const first = normalizeModelSettings(legacy);
  const second = normalizeModelSettings(legacy);
  assert.equal(first.modelInstances.length, 1);
  assert.equal(first.modelInstances[0].id, second.modelInstances[0].id);
  assert.equal(first.modelInstances[0].supportsVision, true);
  assert.equal(first.apiKey, "key");
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
