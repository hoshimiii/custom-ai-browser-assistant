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
