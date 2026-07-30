import test from "node:test";
import assert from "node:assert/strict";
import { describeEvidence, fetchPlatformSubtitle, parseBilibiliSubtitle, parseYouTubeJson3, replaceWithLocalAsr, replaceWithPlatformSubtitle, selectYouTubeTrack } from "../src/shared/platformSubtitles.js";

test("selects a valid human YouTube track before ASR and rejects invalid endpoints", () => {
  const track = selectYouTubeTrack([{ kind: "asr", baseUrl: "https://www.youtube.com/api/timedtext?lang=en" }, { baseUrl: "https://www.youtube.com/api/timedtext?lang=zh" }]);
  assert.equal(track.kind, undefined);
  assert.equal(selectYouTubeTrack([{ baseUrl: "https://evil.test/api/timedtext" }]), null);
});

test("parses timestamped subtitle payloads without removing repeated speech", () => {
  assert.equal(parseYouTubeJson3({ events: [{ tStartMs: 0, segs: [{ utf8: "hello" }] }, { tStartMs: 1000, segs: [{ utf8: "hello" }] }] }), "[00:00] hello\n[00:01] hello");
  assert.equal(parseBilibiliSubtitle({ body: [{ from: 2.8, content: "你好" }, { from: 3661, content: "一小时后" }] }), "[00:02] 你好\n[01:01:01] 一小时后");
});

test("returns fallback null, propagates abort, and labels platform evidence", async () => {
  const page = { url: "https://www.youtube.com/watch?v=x", transcript: "visible", text: "visible" };
  assert.equal(await fetchPlatformSubtitle(page, { youtubeTracks: [] }), null);
  assert.equal(await fetchPlatformSubtitle(page, { youtubeTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?lang=en" }] }, { fetchFn: async () => { throw new Error("offline"); } }), null);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => fetchPlatformSubtitle(page, { youtubeTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?lang=en" }] }, { signal: abort.signal, fetchFn: async (_url, options) => { throw options.signal.reason; } }));
  const replaced = replaceWithPlatformSubtitle(page, { text: "[00:00] hi", platform: "YouTube", language: "English" });
  assert.equal(replaced.text, "");
  assert.match(describeEvidence(replaced), /平台字幕.*YouTube.*含时间戳/);
  assert.match(describeEvidence(replaceWithLocalAsr(page, { text: "云端转写", language: "zh" })), /Cloudflare ASR（Whisper Large V3 Turbo）/);
  assert.equal(replaceWithLocalAsr(page, { text: "[00:00] 本地转写" }).evidence.timed, true);
  const localAsr = replaceWithLocalAsr(page, { text: "[0.000-5.000] ignored", segments: [{ start: 5, text: "first" }, { start: 3661, text: "second" }] });
  assert.equal(localAsr.transcript, "[00:05] first\n[01:01:01] second");
  assert.equal(localAsr.evidence.timed, true);
  assert.equal(replaceWithLocalAsr(page, { text: "[0.000-5.000] raw" }).evidence.timed, false);
  assert.equal(describeEvidence(page), "证据来源：页面可见字幕/转录");
});

test("normalizes only Bilibili's safe protocol-relative subtitle URL before fetch", async () => {
  const calls = [];
  const response = await fetchPlatformSubtitle({ url: "https://www.bilibili.com/video/BV1xx411c7mD" }, { bilibiliCid: 9 }, {
    fetchFn: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => calls.length === 1 ? { data: { subtitle: { subtitles: [{ subtitle_url: "//aisubtitle.hdslb.com/bfs/a.json", lan: "zh" }] } } } : { body: [{ from: 0, content: "字幕" }] } };
    }
  });
  assert.equal(calls[1], "https://aisubtitle.hdslb.com/bfs/a.json");
  assert.equal(response.text, "[00:00] 字幕");
});
