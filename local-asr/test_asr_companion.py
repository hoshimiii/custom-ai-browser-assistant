import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path
from urllib.error import HTTPError, URLError

SPEC = importlib.util.spec_from_file_location("asr_companion", Path(__file__).with_name("asr_companion.py"))
asr = importlib.util.module_from_spec(SPEC); sys.modules[SPEC.name] = asr; SPEC.loader.exec_module(asr)


class CompanionTests(unittest.TestCase):
    account, provider_token = "a" * 32, "provider-token"
    def _server(self):
        server = asr.CompanionServer(("127.0.0.1", 0), "chrome-extension://" + "a" * 32, "t" * 32, lambda job: {"text": "ok"})
        threading.Thread(target=server.serve_forever, daemon=True).start(); self.addCleanup(lambda: (server.shutdown(), server.server_close())); return server
    def _request(self, server, method, path, body=None, **headers):
        base = {"Host": f"127.0.0.1:{server.server_port}", "Origin": server.origin, "X-Local-Asr-Token": server.token}; base.update(headers)
        conn = HTTPConnection("127.0.0.1", server.server_port, timeout=2); conn.request(method, path, body=body, headers=base); response = conn.getresponse(); payload = response.read(); conn.close(); return response.status, payload
    def test_http_auth_origin_host_and_request_limits(self):
        server = self._server(); self.assertEqual(self._request(server, "GET", "/v1/health")[0], 200)
        self.assertEqual(self._request(server, "GET", "/v1/health", Origin="chrome-extension://" + "b" * 32)[0], 403)
        self.assertEqual(self._request(server, "GET", "/v1/health", Host="localhost:8765")[0], 403)
        self.assertEqual(self._request(server, "POST", "/v1/jobs", "{}", **{"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self._request(server, "POST", "/v1/jobs", b"", **{"Content-Type": "application/json", "Content-Length": str(asr.MAX_REQUEST_BYTES + 1)})[0], 413)
    def test_preflight_and_url_allowlist(self):
        server = self._server(); self.assertEqual(self._request(server, "OPTIONS", "/v1/jobs", **{"X-Local-Asr-Token": "", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, x-local-asr-token"})[0], 204)
        self.assertEqual(asr.validate_video_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        self.assertEqual(asr.validate_video_url("https://www.bilibili.com/video/BV1xx411c7mD?p=2"), "https://www.bilibili.com/video/BV1xx411c7mD?p=2")
        for value in ("http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.test/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "https://user@www.youtube.com/watch?v=dQw4w9WgXcQ"):
            with self.assertRaises(asr.PublicError): asr.validate_video_url(value)
    def test_configuration_validation(self):
        self.assertEqual(asr.cloudflare_credentials({"CLOUDFLARE_ACCOUNT_ID": self.account, "CLOUDFLARE_API_TOKEN": self.provider_token}), (self.account, self.provider_token))
        for env in ({}, {"CLOUDFLARE_ACCOUNT_ID": "A" * 32, "CLOUDFLARE_API_TOKEN": "x"}, {"CLOUDFLARE_ACCOUNT_ID": self.account, "CLOUDFLARE_API_TOKEN": "has space"}):
            with self.assertRaises(asr.PublicError) as caught: asr.cloudflare_credentials(env)
            self.assertEqual(caught.exception.code, "INVALID_CLOUDFLARE_CONFIGURATION")
    def test_provider_request_and_response_merge(self):
        seen = {}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return json.dumps({"success": True, "result": {"transcription_info": {"language": "en"}, "segments": [{"start": 1, "end": 2, "text": " hello "}]}}).encode()
        def opener(request, timeout): seen.update(url=request.full_url, headers=dict(request.header_items()), body=request.data, timeout=timeout); return Response()
        first, language = asr.request_transcription(self.account, self.provider_token, b"one", 0, opener)
        second, _ = asr.request_transcription(self.account, self.provider_token, b"two", asr.CHUNK_SECONDS, opener)
        self.assertEqual(seen["url"], asr.cloudflare_url(self.account)); self.assertEqual(seen["headers"]["Authorization"], "Bearer " + self.provider_token)
        self.assertEqual(json.loads(seen["body"]), {"audio": "dHdv", "task": "transcribe", "vad_filter": True}); self.assertEqual(seen["timeout"], asr.PROVIDER_TIMEOUT_SECONDS); self.assertEqual((first + second)[1]["start"], 1201); self.assertEqual(language, "en")
    def test_provider_rejections_and_http_mapping(self):
        bad = ({"success": True, "result": {"segments": []}}, {"success": False}, {"success": True, "result": {"segments": [{"start": -1, "end": 1, "text": "x"}]}})
        for payload in bad:
            with self.assertRaises(asr.PublicError): asr.parse_cloudflare_response(payload, 0)
        with self.assertRaises(asr.PublicError) as caught: asr.request_transcription(self.account, self.provider_token, b"x" * (asr.MAX_AUDIO_BYTES + 1), 0)
        self.assertEqual(caught.exception.code, "AUDIO_TOO_LARGE")
        for status, code in ((401, "CLOUDFLARE_AUTH_FAILED"), (413, "AUDIO_TOO_LARGE"), (429, "CLOUDFLARE_RATE_LIMITED")):
            def opener(request, timeout, status=status): raise HTTPError(request.full_url, status, "", {}, None)
            with self.assertRaises(asr.PublicError) as caught: asr.request_transcription(self.account, self.provider_token, b"x", 0, opener)
            self.assertEqual(caught.exception.code, code)
        with self.assertRaises(asr.PublicError) as caught: asr.request_transcription(self.account, self.provider_token, b"x", 0, lambda *args, **kwargs: (_ for _ in ()).throw(URLError("offline")))
        self.assertEqual(caught.exception.code, "CLOUDFLARE_UNAVAILABLE")
    def test_vtt_fallback_with_offset_and_rejection(self):
        payload = {"success": True, "result": {"vtt": "WEBVTT\r\n\r\nintro\r\n00:01.250 --> 00:03.500 align:start\r\nfirst line\r\nsecond line\r\n\r\n00:04.000 --> 00:05.000\r\nlast\r\n", "transcription_info": {"language": "en"}}}
        segments, language = asr.parse_cloudflare_response(payload, asr.CHUNK_SECONDS)
        self.assertEqual(language, "en"); self.assertEqual(segments, [{"start": 1201.25, "end": 1203.5, "text": "first line\nsecond line"}, {"start": 1204.0, "end": 1205.0, "text": "last"}])
        for value in ("WEBVTT\n\njust text", "WEBVTT\n\n00:61.000 --> 00:62.000\nx", "WEBVTT\n\n00:01.000 --> 00:02.000\n\n"):
            with self.assertRaises(asr.PublicError) as caught: asr.parse_cloudflare_response({"success": True, "result": {"vtt": value}}, 0)
            self.assertEqual(caught.exception.code, "TRANSCRIBE_FAILED")
    def test_provider_chunk_timestamp_bounds_and_order(self):
        upper = asr.CHUNK_SECONDS + asr.CHUNK_TIME_TOLERANCE_SECONDS
        raw = {"success": True, "result": {"segments": [{"start": upper, "end": upper, "text": "edge"}]}}
        self.assertEqual(asr.parse_cloudflare_response(raw, 0)[0][0]["end"], upper)
        vtt = {"success": True, "result": {"vtt": f"WEBVTT\n\n{upper // 60:02d}:{upper % 60:02d}.000 --> {upper // 60:02d}:{upper % 60:02d}.000\nedge"}}
        self.assertEqual(asr.parse_cloudflare_response(vtt, 0)[0][0]["end"], upper)
        raw_bad = ({"success": True, "result": {"segments": [{"start": 0, "end": upper + 1, "text": "x"}]}}, {"success": True, "result": {"segments": [{"start": 2, "end": 3, "text": "x"}, {"start": 1, "end": 2, "text": "y"}]}})
        vtt_bad = (f"WEBVTT\n\n00:00.000 --> {upper // 60:02d}:{(upper + 1) % 60:02d}.000\nx", "WEBVTT\n\n00:02.000 --> 00:03.000\nx\n\n00:01.000 --> 00:02.000\ny")
        for payload in raw_bad:
            with self.assertRaises(asr.PublicError): asr.parse_cloudflare_response(payload, 0)
        for value in vtt_bad:
            with self.assertRaises(asr.PublicError): asr.parse_cloudflare_response({"success": True, "result": {"vtt": value}}, 0)
    def test_ffmpeg_command_and_missing(self):
        old = asr.shutil.which; asr.shutil.which = lambda name: "C:/ffmpeg.exe"
        try: command = asr.ffmpeg_command(Path("in.webm"), Path("chunk-%03d.mp3"))
        finally: asr.shutil.which = old
        self.assertEqual(command[:3], ["C:/ffmpeg.exe", "-nostdin", "-y"]); self.assertIn("-vn", command); self.assertIn("-segment_time", command); self.assertIn("1200", command); self.assertIn("-reset_timestamps", command); self.assertIn("1", command); self.assertNotIn("shell", command)
        asr.shutil.which = lambda name: None
        try:
            with self.assertRaises(asr.PublicError) as caught: asr.ffmpeg_command(Path("in"), Path("out"))
            self.assertEqual(caught.exception.code, "FFMPEG_MISSING")
        finally: asr.shutil.which = old
    def test_one_job_busy_and_cancellation(self):
        release = threading.Event(); jobs = asr.JobStore(lambda job: (release.wait(1), {"text": "ok"})[1]); first = jobs.start("url")
        with self.assertRaises(asr.PublicError) as caught: jobs.start("url")
        self.assertEqual(caught.exception.code, "BUSY"); jobs.cancel(first.id); self.assertTrue(first.cancel.is_set()); release.set()
    def test_total_transcript_bounds(self):
        old_segments, old_chars = asr.MAX_TOTAL_SEGMENTS, asr.MAX_TRANSCRIPT_CHARS
        try:
            asr.MAX_TOTAL_SEGMENTS = 1
            with self.assertRaises(asr.PublicError): asr.structured_result("url", "en", [{"start": 0, "end": 1, "text": "a"}, {"start": 1, "end": 2, "text": "b"}])
            asr.MAX_TOTAL_SEGMENTS, asr.MAX_TRANSCRIPT_CHARS = 2, 1
            with self.assertRaises(asr.PublicError): asr.structured_result("url", "en", [{"start": 0, "end": 1, "text": "a"}])
        finally: asr.MAX_TOTAL_SEGMENTS, asr.MAX_TRANSCRIPT_CHARS = old_segments, old_chars
    def test_cleanup_and_chunk_bounds_without_media(self):
        old_ydl, old_run, old_which = sys.modules.get("yt_dlp"), asr.subprocess.run, asr.shutil.which; created = []
        class FakeYDL:
            def __init__(self, options): self.options = options
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def extract_info(self, url, download=False):
                if not download: return {"duration": 30}
                Path(self.options["outtmpl"].replace("%(ext)s", "webm")).write_bytes(b"audio")
        class TrackingDirectory:
            def __init__(self, **kwargs): self.path = tempfile.mkdtemp(); created.append(self.path)
            def __enter__(self): return self.path
            def __exit__(self, *args): shutil.rmtree(self.path)
        old_temp = asr.tempfile.TemporaryDirectory; asr.tempfile.TemporaryDirectory = TrackingDirectory; sys.modules["yt_dlp"] = type("M", (), {"YoutubeDL": FakeYDL}); asr.shutil.which = lambda name: "ffmpeg"
        def fake_run(command, **kwargs):
            folder = Path(command[-1]).parent
            for index in range(asr.MAX_CHUNKS + 1): (folder / f"chunk-{index:03d}.mp3").write_bytes(b"x")
            return type("Result", (), {"returncode": 0})()
        asr.subprocess.run = fake_run
        try:
            with self.assertRaises(asr.PublicError) as caught: asr.run_transcription(asr.Job("x", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), (self.account, self.provider_token))
            self.assertEqual(caught.exception.code, "AUDIO_PREPARE_FAILED")
        finally:
            asr.tempfile.TemporaryDirectory, asr.subprocess.run, asr.shutil.which = old_temp, old_run, old_which
            if old_ydl is None: del sys.modules["yt_dlp"]
            else: sys.modules["yt_dlp"] = old_ydl
        self.assertTrue(created); self.assertFalse(Path(created[0]).exists())


if __name__ == "__main__": unittest.main()
