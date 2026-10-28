import test from "node:test";
import assert from "node:assert/strict";
import { createBackupPayload, mergeBackupPayload } from "../src/shared/backup.js";
import { requestChat, sameCredentialEndpoint, streamChat } from "../src/shared/apiClient.js";
import { requestSpeech, resolveTtsSettings } from "../src/shared/tts.js";

const endpoint = "https://provider.example/v1";
const other = "https://other.example/v1";
const current = () => createBackupPayload({ settings: {
  modelInstances: [{ id: "one", baseUrl: endpoint, apiKey: "old-chat-key", model: "model" }],
  defaultModelInstanceId: "one",
  ttsApiKey: "old-tts-key", ttsModel: "speech", ttsVoice: "voice"
} }, "old", { includeApiKey: true });

function incoming(baseUrl, apiKey = "", modern = false, extra = {}) {
  const model = { id: "one", baseUrl, apiKey, model: "model" };
  return { version: 1, app: "custom-ai-browser-assistant", settings: {
    ...(modern ? { modelInstances: [model], defaultModelInstanceId: "one" } : model),
    ttsModel: "speech", ttsVoice: "voice", ...extra
  } };
}

test("credential endpoint comparison normalizes URLs while retaining path and query scope", () => {
  for (const value of [endpoint, `${endpoint}/`, " https://PROVIDER.example:443/x/../v1/// "]) {
    assert.equal(sameCredentialEndpoint(endpoint, value), true);
  }
  for (const value of [other, `${endpoint}/other`, `${endpoint}?tenant=other`, `${endpoint}#other`, "http://provider.example/v1", "invalid", ""]) {
    assert.equal(sameCredentialEndpoint(endpoint, value), false);
  }
  assert.equal(sameCredentialEndpoint("", ""), true);
  assert.equal(sameCredentialEndpoint("invalid", "invalid"), false);
});

for (const modern of [false, true]) {
  const format = modern ? "modern same-ID" : "legacy flat";
  test(`${format} merge retains blank-key credentials only for the same endpoint`, () => {
    for (const baseUrl of [endpoint, `${endpoint}/`, "https://PROVIDER.example:443/x/../v1"]) {
      const merged = mergeBackupPayload(current(), incoming(baseUrl, "", modern));
      assert.equal(merged.settings.apiKey, "old-chat-key");
      assert.equal(merged.settings.modelInstances[0].apiKey, "old-chat-key");
      assert.equal(merged.settings.ttsApiKey, "old-tts-key");
      assert.equal(merged.settings.defaultModelInstanceId, "one");
    }
    for (const baseUrl of [other, `${endpoint}/other`, `${endpoint}?tenant=other`, `${endpoint}#other`, "invalid", ""]) {
      const merged = mergeBackupPayload(current(), incoming(baseUrl, "", modern));
      assert.equal(merged.settings.apiKey, "");
      assert.equal(merged.settings.modelInstances[0].apiKey, "");
      assert.equal(merged.settings.ttsApiKey, "");
      assert.equal(resolveTtsSettings(merged.settings).apiKey, "");
    }
  });

  test(`${format} explicit incoming keys belong to the incoming endpoint; replace never inherits`, () => {
    const merged = mergeBackupPayload(current(), incoming(other, "new-chat-key", modern, { ttsApiKey: "new-tts-key" }));
    assert.equal(merged.settings.apiKey, "new-chat-key");
    assert.equal(merged.settings.ttsApiKey, "new-tts-key");
    for (const baseUrl of [endpoint, other]) {
      const replaced = mergeBackupPayload(current(), incoming(baseUrl, "", modern), "replace");
      assert.equal(replaced.settings.apiKey, "");
      assert.equal(replaced.settings.ttsApiKey, "");
    }
  });

  test(`${format} imported TTS aliases cannot reuse chat or TTS keys at a changed destination`, () => {
    for (const ttsBaseUrl of [other, `${endpoint}/speech`, `${endpoint}?tenant=other`]) {
      const merged = mergeBackupPayload(current(), incoming(endpoint, "", modern, { ttsBaseUrl }));
      assert.equal(merged.settings.apiKey, "old-chat-key");
      assert.equal(merged.settings.ttsApiKey, "");
      assert.equal(resolveTtsSettings(merged.settings).apiKey, "");
      const explicit = mergeBackupPayload(current(), incoming(endpoint, "", modern, { ttsBaseUrl, ttsApiKey: "incoming-speech-key" }));
      assert.equal(resolveTtsSettings(explicit.settings).apiKey, "incoming-speech-key");
    }
    const fixedTts = current();
    fixedTts.settings.ttsBaseUrl = endpoint;
    assert.equal(mergeBackupPayload(fixedTts, incoming(other, "", modern, { ttsBaseUrl: `${endpoint}/` })).settings.ttsApiKey, "old-tts-key");
    fixedTts.settings.ttsBaseUrl = other;
    assert.equal(mergeBackupPayload(fixedTts, incoming(endpoint, "", modern)).settings.ttsApiKey, "");
  });
}

test("chat, streaming chat and TTS refuse imported missing credentials before fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("unexpected fetch"); };
  for (const modern of [false, true]) {
    const merged = mergeBackupPayload(current(), incoming(other, "", modern)).settings;
    await assert.rejects(requestChat(merged, [], { fetchImpl }), /API Key/);
    await assert.rejects(streamChat(merged, [], {}, { fetchImpl }), /API Key/);
    await assert.rejects(requestSpeech(merged, "hello", { fetchImpl }), /API Key/);
    const ttsOnly = mergeBackupPayload(current(), incoming(endpoint, "", modern, { ttsBaseUrl: other })).settings;
    await assert.rejects(requestSpeech(ttsOnly, "hello", { fetchImpl }), /API Key/);
  }
  assert.equal(calls, 0);
});

test("same-endpoint merge and explicit new endpoint credentials reach mocked request sinks", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, key: options.headers.Authorization });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "answer" } }] }), blob: async () => new Blob(["audio"]) };
  };
  const same = mergeBackupPayload(current(), incoming(`${endpoint}/`)).settings;
  assert.equal(await requestChat(same, [], { fetchImpl }), "answer");
  await streamChat(same, [], {}, { fetchImpl });
  await requestSpeech(same, "hello", { fetchImpl });
  const explicit = mergeBackupPayload(current(), incoming(other, "new-key", false, { ttsApiKey: "new-tts-key" })).settings;
  await requestChat(explicit, [], { fetchImpl });
  await requestSpeech(explicit, "hello", { fetchImpl });
  assert.deepEqual(requests, [
    { url: `${endpoint}/chat/completions`, key: "Bearer old-chat-key" },
    { url: `${endpoint}/chat/completions`, key: "Bearer old-chat-key" },
    { url: `${endpoint}/audio/speech`, key: "Bearer old-tts-key" },
    { url: `${other}/chat/completions`, key: "Bearer new-key" },
    { url: `${other}/audio/speech`, key: "Bearer new-tts-key" }
  ]);
});

test("blank TTS key inherits chat key only at the same canonical endpoint", () => {
  for (const ttsBaseUrl of ["", endpoint, `${endpoint}/`, "https://PROVIDER.example:443/x/../v1"]) {
    assert.equal(resolveTtsSettings({ baseUrl: endpoint, apiKey: "chat-key", ttsBaseUrl }).apiKey, "chat-key");
  }
  assert.equal(resolveTtsSettings({ baseUrl: endpoint, apiKey: "chat-key", ttsBaseUrl: other }).apiKey, "");
  assert.equal(resolveTtsSettings({ baseUrl: endpoint, apiKey: "chat-key", ttsBaseUrl: other, ttsApiKey: "tts-key" }).apiKey, "tts-key");
});
