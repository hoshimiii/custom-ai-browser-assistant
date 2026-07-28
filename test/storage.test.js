import test from "node:test";
import assert from "node:assert/strict";
import { getSettings, saveConversation, savePageRecipe, findStoredPageRecipe, deletePageRecipe } from "../src/shared/storage.js";

test("saveConversation updates one active history record across turns", async () => {
  const storage = { history: [] };
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
    let conversation = await saveConversation({ title: "First", messages: [{ role: "user", content: "one" }] });
    conversation = await saveConversation({
      id: conversation.id,
      createdAt: conversation.createdAt,
      title: conversation.title,
      messages: [...conversation.messages, { role: "assistant", content: "two" }]
    });
    await saveConversation({
      id: conversation.id,
      createdAt: conversation.createdAt,
      title: conversation.title,
      messages: [...conversation.messages, { role: "user", content: "three" }]
    });

    assert.equal(storage.history.length, 1);
    assert.equal(storage.history[0].messages.length, 3);
    assert.equal(storage.history[0].createdAt, conversation.createdAt);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("getSettings persists the canonical legacy migration once", async () => {
  const storage = { settings: { model: "legacy", apiKey: "key" } };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get(key) { return { [key]: storage[key] }; }, async set(next) { Object.assign(storage, next); } } } };
  try {
    const settings = await getSettings();
    assert.equal(settings.modelInstances[0].model, "legacy");
    assert.equal(settings.modelInstances[0].supportsVision, true);
    assert.deepEqual(await getSettings(), settings);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("getSettings retains valid effort and repairs invalid stored effort", async () => {
  const storage = { settings: { modelInstances: [
    { id: "gpt", model: "gpt-5", reasoningEffort: "high" },
    { id: "bad", model: "other", reasoningEffort: "invalid" }
  ], defaultModelInstanceId: "gpt" } };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get(key) { return { [key]: storage[key] }; }, async set(next) { Object.assign(storage, next); } } } };
  try {
    const settings = await getSettings();
    assert.deepEqual(settings.modelInstances.map((item) => item.reasoningEffort), ["high", ""]);
    assert.equal(storage.settings.modelInstances[0].reasoningEffort, "high");
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("page recipe storage upserts, finds, and deletes bounded recipes", async () => {
  const storage = { pageRecipes: [] };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get(key) { return { [key]: storage[key] }; }, async set(next) { Object.assign(storage, next); } } } };
  try {
    await savePageRecipe({ origin: "https://example.com/a", pageType: "webpage", operation: "chat", selectors: ["main"] });
    assert.deepEqual((await findStoredPageRecipe("https://example.com/b", "webpage", "chat")).selectors, ["main"]);
    await deletePageRecipe("https://example.com|webpage|chat");
    assert.equal(await findStoredPageRecipe("https://example.com", "webpage", "chat"), null);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
