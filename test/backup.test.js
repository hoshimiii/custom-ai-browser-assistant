import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_VERSION, createBackupPayload, mergeBackupPayload, parseBackupPayload } from "../src/shared/backup.js";

test("createBackupPayload includes version and app marker", () => {
  const payload = createBackupPayload({ settings: { model: "m", apiKey: "secret" }, history: [], savedPages: [] }, "now");
  assert.equal(payload.version, BACKUP_VERSION);
  assert.equal(payload.app, "custom-ai-browser-assistant");
  assert.equal(payload.settings.model, "m");
  assert.equal(payload.settings.apiKey, "");
});

test("createBackupPayload can explicitly include api key", () => {
  const payload = createBackupPayload({ settings: { apiKey: "secret" } }, "now", { includeApiKey: true });
  assert.equal(payload.settings.apiKey, "secret");
});

test("parseBackupPayload rejects wrong app marker", () => {
  assert.throws(() => parseBackupPayload({ version: BACKUP_VERSION, app: "other" }), /不是有效/);
});

test("mergeBackupPayload merges arrays by id", () => {
  const current = createBackupPayload({
    history: [{ id: "a", title: "old" }],
    savedPages: [{ id: "p1", title: "old" }]
  }, "old");
  const backup = createBackupPayload({
    history: [{ id: "a", title: "new" }, { id: "b", title: "new b" }],
    savedPages: [{ id: "p2", title: "new p" }]
  }, "new");
  const merged = mergeBackupPayload(current, backup);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.history[0].title, "new");
  assert.equal(merged.savedPages.length, 2);
});

test("mergeBackupPayload replace mode returns backup data", () => {
  const current = createBackupPayload({ history: [{ id: "a" }] }, "old");
  const backup = createBackupPayload({ history: [{ id: "b" }] }, "new");
  const merged = mergeBackupPayload(current, backup, "replace");
  assert.deepEqual(merged.history, [{ id: "b" }]);
});

test("mergeBackupPayload preserves current api key when backup omits it", () => {
  const current = createBackupPayload({ settings: { apiKey: "current-key" } }, "old", { includeApiKey: true });
  const backup = createBackupPayload({ settings: { model: "new-model", apiKey: "backup-key" } }, "new");
  const merged = mergeBackupPayload(current, backup, "merge");
  assert.equal(merged.settings.model, "new-model");
  assert.equal(merged.settings.apiKey, "current-key");
});
