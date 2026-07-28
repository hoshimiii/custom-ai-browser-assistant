import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_VERSION, createBackupPayload, mergeBackupPayload, parseBackupPayload } from "../src/shared/backup.js";
import { importBackup } from "../src/shared/storage.js";

test("createBackupPayload includes version and app marker", () => {
  const payload = createBackupPayload({ settings: { model: "m", apiKey: "secret" }, history: [], savedPages: [] }, "now");
  assert.equal(payload.version, BACKUP_VERSION);
  assert.equal(payload.app, "custom-ai-browser-assistant");
  assert.equal(payload.settings.model, "m");
  assert.equal(payload.settings.apiKey, "");
});

test("createBackupPayload redacts both keys unless explicitly included", () => {
  const redacted = createBackupPayload({ settings: { apiKey: "secret", ttsApiKey: "tts-secret" } }, "now");
  assert.equal(redacted.settings.apiKey, "");
  assert.equal(redacted.settings.ttsApiKey, "");
  const payload = createBackupPayload({ settings: { apiKey: "secret", ttsApiKey: "tts-secret" } }, "now", { includeApiKey: true });
  assert.equal(payload.settings.apiKey, "secret");
  assert.equal(payload.settings.ttsApiKey, "tts-secret");
});

test("createBackupPayload redacts every model-instance key", () => {
  const payload = createBackupPayload({ settings: { modelInstances: [{ id: "one", name: "One", apiKey: "secret", reasoningEffort: "high" }], defaultModelInstanceId: "one" } }, "now");
  assert.equal(payload.settings.modelInstances[0].apiKey, "");
  assert.equal(payload.settings.modelInstances[0].reasoningEffort, "high");
});

test("parseBackupPayload rejects wrong app marker", () => {
  assert.throws(() => parseBackupPayload({ version: BACKUP_VERSION, app: "other" }), /不是有效/);
});

test("mergeBackupPayload merges arrays by id", () => {
  const current = createBackupPayload({
    history: [{ id: "a", title: "old" }],
    savedPages: [{ id: "p1", title: "old" }],
    floatingSessions: [{ id: "fs1", title: "old floating" }]
  }, "old");
  const backup = createBackupPayload({
    history: [{ id: "a", title: "new" }, { id: "b", title: "new b" }],
    savedPages: [{ id: "p2", title: "new p" }],
    floatingSessions: [{ id: "fs2", title: "new floating" }]
  }, "new");
  const merged = mergeBackupPayload(current, backup);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.history[0].title, "new");
  assert.equal(merged.savedPages.length, 2);
  assert.equal(merged.floatingSessions.length, 2);
});

test("backup imports and merges page recipes by their bounded IDs", () => {
  const current = createBackupPayload({ pageRecipes: [{ origin: "https://example.com", pageType: "webpage", operation: "chat", selectors: ["main"] }] }, "old");
  const backup = createBackupPayload({ pageRecipes: [{ origin: "https://example.com", pageType: "webpage", operation: "chat", selectors: ["article"], text: "discard" }] }, "new");
  const merged = mergeBackupPayload(current, backup);
  assert.deepEqual(merged.pageRecipes[0].selectors, ["article"]);
  assert.equal("text" in merged.pageRecipes[0], false);
});

test("mergeBackupPayload replace mode returns backup data", () => {
  const current = createBackupPayload({ history: [{ id: "a" }] }, "old");
  const backup = createBackupPayload({ history: [{ id: "b" }] }, "new");
  const merged = mergeBackupPayload(current, backup, "replace");
  assert.deepEqual(merged.history, [{ id: "b" }]);
});

test("mergeBackupPayload preserves current keys when backup omits them", () => {
  const current = createBackupPayload({ settings: { apiKey: "current-key", ttsApiKey: "current-tts-key" } }, "old", { includeApiKey: true });
  const backup = createBackupPayload({ settings: { model: "new-model", apiKey: "backup-key", ttsApiKey: "backup-tts-key" } }, "new");
  const merged = mergeBackupPayload(current, backup, "merge");
  assert.equal(merged.settings.model, "new-model");
  assert.equal(merged.settings.apiKey, "current-key");
  assert.equal(merged.settings.ttsApiKey, "current-tts-key");
});

test("mergeBackupPayload keeps matching redacted instance keys and never transfers them across IDs", () => {
  const current = createBackupPayload({ settings: {
    modelInstances: [{ id: "one", name: "One", apiKey: "one-key" }, { id: "two", name: "Two", apiKey: "two-key" }],
    defaultModelInstanceId: "one"
  } }, "old", { includeApiKey: true });
  const backup = createBackupPayload({ settings: {
    modelInstances: [{ id: "one", name: "Renamed" }, { id: "three", name: "Three" }],
    defaultModelInstanceId: "three"
  } }, "new");
  const merged = mergeBackupPayload(current, backup);
  assert.deepEqual(merged.settings.modelInstances.map((item) => [item.id, item.apiKey]), [["one", "one-key"], ["three", ""], ["two", "two-key"]]);
  assert.equal(merged.settings.modelInstances[0].name, "Renamed");
});

test("backup merge retains per-instance reasoning effort", () => {
  const current = createBackupPayload({ settings: {
    modelInstances: [{ id: "one", name: "One", reasoningEffort: "high" }],
    defaultModelInstanceId: "one"
  } }, "old");
  const backup = createBackupPayload({ settings: {
    modelInstances: [{ id: "one", name: "One", reasoningEffort: "xhigh" }],
    defaultModelInstanceId: "one"
  } }, "new");
  assert.equal(mergeBackupPayload(current, backup).settings.modelInstances[0].reasoningEffort, "xhigh");
});

test("legacy flat backup overlays the current default without changing its identity", () => {
  const current = createBackupPayload({ settings: { modelInstances: [{ id: "current", name: "Old", apiKey: "keep", model: "old" }], defaultModelInstanceId: "current" } }, "old", { includeApiKey: true });
  const legacy = { version: BACKUP_VERSION, app: "custom-ai-browser-assistant", settings: { model: "new", apiKey: "" }, history: [], savedPages: [], floatingSessions: [] };
  const merged = mergeBackupPayload(current, legacy);
  assert.equal(merged.settings.defaultModelInstanceId, "current");
  assert.equal(merged.settings.modelInstances[0].id, "current");
  assert.equal(merged.settings.modelInstances[0].model, "new");
  assert.equal(merged.settings.modelInstances[0].apiKey, "keep");
});

test("importBackup merge preserves existing redacted keys", async () => {
  const storage = {
    settings: { apiKey: "current-key", ttsApiKey: "current-tts-key" },
    history: [],
    savedPages: [],
    floatingSessions: []
  };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(next) {
          Object.assign(storage, next);
        }
      }
    }
  };
  try {
    await importBackup(createBackupPayload({ settings: { model: "new-model" } }, "now"));
    assert.equal(storage.settings.apiKey, "current-key");
    assert.equal(storage.settings.ttsApiKey, "current-tts-key");
  } finally {
    globalThis.chrome = previousChrome;
  }
});
