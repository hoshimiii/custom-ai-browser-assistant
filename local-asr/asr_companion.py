#!/usr/bin/env python3
"""Loopback-only video audio helper using Cloudflare Workers AI."""

from __future__ import annotations

import argparse
import base64
import hmac
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

HOST, PORT = "127.0.0.1", 8765
MAX_REQUEST_BYTES = 4096
MAX_DURATION_SECONDS = 4 * 60 * 60
CHUNK_SECONDS, MAX_CHUNKS = 1200, 12
CHUNK_TIME_TOLERANCE_SECONDS = 5
MAX_AUDIO_BYTES = MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024
MAX_SEGMENTS, MAX_SEGMENT_TEXT = 10000, 4096
MAX_TOTAL_SEGMENTS, MAX_TRANSCRIPT_CHARS = 100000, 2_000_000
PROVIDER_TIMEOUT_SECONDS = 600
RESULT_TTL_SECONDS = 5 * 60
EXTENSION_ORIGIN_RE = re.compile(r"^chrome-extension://[a-p]{32}$")
ACCOUNT_ID_RE = re.compile(r"^[a-f0-9]{32}$")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
VTT_TIMING_RE = re.compile(r"^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})[ \t]+-->[ \t]+(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})(?:[ \t]+[^\r\n]+)?$")


class PublicError(Exception):
    def __init__(self, code: str, status: int = 400):
        self.code, self.status = code, status
        super().__init__(code)


def fail(code: str, status: int = 400) -> None:
    raise PublicError(code, status)


def validate_extension_origin(origin: str) -> str:
    if not EXTENSION_ORIGIN_RE.fullmatch(origin): fail("INVALID_ORIGIN")
    return origin


def validate_token(token: str) -> str:
    if len(token) < 32 or not token.strip(): fail("WEAK_TOKEN")
    return token


def cloudflare_credentials(env: Any = os.environ) -> tuple[str, str]:
    account, token = env.get("CLOUDFLARE_ACCOUNT_ID", ""), env.get("CLOUDFLARE_API_TOKEN", "")
    if not isinstance(account, str) or not ACCOUNT_ID_RE.fullmatch(account): fail("INVALID_CLOUDFLARE_CONFIGURATION", 503)
    if not isinstance(token, str) or not token or len(token) > 512 or any(char.isspace() for char in token): fail("INVALID_CLOUDFLARE_CONFIGURATION", 503)
    return account, token


def validate_video_url(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 2048: fail("INVALID_URL")
    parsed = urlparse(value)
    try: port = parsed.port
    except ValueError: fail("INVALID_URL")
    if parsed.scheme != "https" or parsed.username or parsed.password or port or parsed.fragment: fail("INVALID_URL")
    host, query = (parsed.hostname or "").lower(), parse_qs(parsed.query, keep_blank_values=True)
    if host in {"www.youtube.com", "youtube.com"}:
        if parsed.path != "/watch" or "list" in query or len(query.get("v", [])) != 1: fail("UNSUPPORTED_URL")
        video_id = query["v"][0]
        if not YOUTUBE_ID_RE.fullmatch(video_id): fail("UNSUPPORTED_URL")
        return f"https://www.youtube.com/watch?v={video_id}"
    if host == "youtu.be":
        if "list" in query or parsed.path.count("/") != 1: fail("UNSUPPORTED_URL")
        video_id = parsed.path[1:]
        if not YOUTUBE_ID_RE.fullmatch(video_id): fail("UNSUPPORTED_URL")
        return f"https://youtu.be/{video_id}"
    match = re.fullmatch(r"/video/(BV[1-9A-HJ-NP-Za-km-z]{10})/?", parsed.path)
    if host == "www.bilibili.com" and match:
        part = query.get("p", [])
        if len(part) > 1 or (part and not re.fullmatch(r"[1-9][0-9]*", part[0])): fail("UNSUPPORTED_URL")
        return f"https://www.bilibili.com/video/{match.group(1)}" + (f"?p={part[0]}" if part else "")
    fail("UNSUPPORTED_URL")


def set_windows_below_normal_priority() -> None:
    if os.name != "nt": return
    try:
        import ctypes
        if not ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000): fail("PRIORITY_SETUP_FAILED", 503)
    except PublicError: raise
    except Exception: fail("PRIORITY_SETUP_FAILED", 503)


def downloader_options(output_template: str, progress_hook: Any) -> dict[str, Any]:
    return {"format": "bestaudio/best", "noplaylist": True, "outtmpl": output_template, "quiet": True, "no_warnings": True, "progress_hooks": [progress_hook]}


def cloudflare_url(account: str) -> str:
    return f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/openai/whisper-large-v3-turbo"


def vtt_seconds(match: re.Match[str], start: int) -> float:
    hours = int(match.group(start) or 0)
    return hours * 3600 + int(match.group(start + 1)) * 60 + int(match.group(start + 2)) + int(match.group(start + 3)) / 1000


def parse_vtt(value: Any, offset: float) -> list[dict[str, Any]]:
    if not isinstance(value, str) or len(value) > MAX_PROVIDER_RESPONSE_BYTES: fail("TRANSCRIBE_FAILED", 502)
    lines, index, segments, last_start = value.lstrip("\ufeff").splitlines(), 0, [], 0.0
    if not lines or not re.fullmatch(r"WEBVTT(?:[ \t].*)?", lines[0]): fail("TRANSCRIBE_FAILED", 502)
    index = 1
    while index < len(lines):
        if not lines[index].strip(): index += 1; continue
        if re.match(r"^(?:NOTE|STYLE|REGION)(?:[ \t].*)?$", lines[index]):
            index += 1
            while index < len(lines) and lines[index].strip(): index += 1
            continue
        timing = VTT_TIMING_RE.fullmatch(lines[index])
        if not timing:
            if "-->" in lines[index] or len(lines[index]) > 256 or index + 1 >= len(lines): fail("TRANSCRIBE_FAILED", 502)
            index += 1; timing = VTT_TIMING_RE.fullmatch(lines[index])
            if not timing: fail("TRANSCRIBE_FAILED", 502)
        start, end = vtt_seconds(timing, 1), vtt_seconds(timing, 5)
        if (not math.isfinite(start) or not math.isfinite(end) or start < last_start or end < start
                or end > CHUNK_SECONDS + CHUNK_TIME_TOLERANCE_SECONDS): fail("TRANSCRIBE_FAILED", 502)
        index += 1; text_lines = []
        while index < len(lines) and lines[index].strip():
            text = lines[index].strip()
            if len(text) > MAX_SEGMENT_TEXT: fail("TRANSCRIBE_FAILED", 502)
            text_lines.append(text); index += 1
        text = "\n".join(text_lines)
        if not text or len(text) > MAX_SEGMENT_TEXT or len(segments) >= MAX_SEGMENTS: fail("TRANSCRIBE_FAILED", 502)
        segments.append({"start": round(start + offset, 3), "end": round(end + offset, 3), "text": text})
        last_start = start
    if not segments: fail("TRANSCRIBE_FAILED", 502)
    return segments


def parse_cloudflare_response(payload: Any, offset: float) -> tuple[list[dict[str, Any]], str]:
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("result"), dict): fail("TRANSCRIBE_FAILED", 502)
    result, raw_segments = payload["result"], payload["result"].get("segments")
    if raw_segments is None:
        segments = parse_vtt(result.get("vtt"), offset)
    else:
        if not isinstance(raw_segments, list) or not raw_segments or len(raw_segments) > MAX_SEGMENTS: fail("TRANSCRIBE_FAILED", 502)
        segments, last_start = [], 0.0
        for segment in raw_segments:
            if not isinstance(segment, dict): fail("TRANSCRIBE_FAILED", 502)
            start, end, text = segment.get("start"), segment.get("end"), segment.get("text")
            if (not isinstance(start, (int, float)) or isinstance(start, bool) or not isinstance(end, (int, float)) or isinstance(end, bool)
                    or not math.isfinite(start) or not math.isfinite(end) or start < 0 or start < last_start or end < start
                    or end > CHUNK_SECONDS + CHUNK_TIME_TOLERANCE_SECONDS
                    or not isinstance(text, str) or not (text := text.strip()) or len(text) > MAX_SEGMENT_TEXT): fail("TRANSCRIBE_FAILED", 502)
            segments.append({"start": round(start + offset, 3), "end": round(end + offset, 3), "text": text})
            last_start = start
    info, language = result.get("transcription_info"), "unknown"
    if isinstance(info, dict) and isinstance(info.get("language"), str):
        candidate = info["language"].strip()
        if candidate and len(candidate) <= 64: language = candidate
    return segments, language


def request_transcription(account: str, token: str, audio: bytes, offset: float, opener: Any = urlopen) -> tuple[list[dict[str, Any]], str]:
    if len(audio) > MAX_AUDIO_BYTES: fail("AUDIO_TOO_LARGE", 413)
    body = json.dumps({"audio": base64.b64encode(audio).decode("ascii"), "task": "transcribe", "vad_filter": True}, separators=(",", ":")).encode()
    request = Request(cloudflare_url(account), data=body, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with opener(request, timeout=PROVIDER_TIMEOUT_SECONDS) as response:
            raw = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code in (401, 403): fail("CLOUDFLARE_AUTH_FAILED", 502)
        if error.code == 413: fail("AUDIO_TOO_LARGE", 413)
        if error.code == 429: fail("CLOUDFLARE_RATE_LIMITED", 503)
        fail("TRANSCRIBE_FAILED", 502)
    except (URLError, OSError, TimeoutError): fail("CLOUDFLARE_UNAVAILABLE", 503)
    if len(raw) > MAX_PROVIDER_RESPONSE_BYTES: fail("TRANSCRIBE_FAILED", 502)
    try: return parse_cloudflare_response(json.loads(raw.decode("utf-8")), offset)
    except PublicError: raise
    except Exception: fail("TRANSCRIBE_FAILED", 502)


def ffmpeg_command(source: Path, output_pattern: Path) -> list[str]:
    executable = shutil.which("ffmpeg")
    if not executable: fail("FFMPEG_MISSING", 503)
    return [executable, "-nostdin", "-y", "-i", str(source), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "segment", "-segment_time", str(CHUNK_SECONDS), "-reset_timestamps", "1", str(output_pattern)]


def structured_result(source: str, language: str, segments: list[dict[str, Any]]) -> dict[str, Any]:
    if not segments or len(segments) > MAX_TOTAL_SEGMENTS: fail("TRANSCRIBE_FAILED", 502)
    text = "\n".join(f"[{item['start']:.3f}-{item['end']:.3f}] {item['text']}" for item in segments)
    if len(text) > MAX_TRANSCRIPT_CHARS: fail("TRANSCRIBE_FAILED", 502)
    return {"source": source, "language": language, "text": text, "segments": segments}


@dataclass
class Job:
    id: str
    url: str
    cancel: threading.Event = field(default_factory=threading.Event)
    status: str = "queued"
    result: dict[str, Any] | None = None
    error: str | None = None
    completed_at: float | None = None
    read: bool = False


class JobStore:
    def __init__(self, runner: Any): self.runner, self.lock, self.job = runner, threading.Lock(), None
    def start(self, url: str) -> Job:
        with self.lock:
            self._expire_locked()
            if self.job and self.job.status in {"queued", "downloading", "transcribing"}: fail("BUSY", 409)
            self.job = Job(uuid.uuid4().hex, url); threading.Thread(target=self._run, args=(self.job,), daemon=True).start(); return self.job
    def _run(self, job: Job) -> None:
        job.status = "downloading"
        try: job.result, job.status = self.runner(job), "cancelled" if job.cancel.is_set() else "completed"
        except PublicError as error: job.error, job.status = error.code, "cancelled" if error.code == "CANCELLED" else "failed"
        except Exception: job.error, job.status = "PROCESSING_FAILED", "failed"
        finally: job.completed_at = time.monotonic()
    def get(self, job_id: str, consume: bool = False) -> dict[str, Any]:
        with self.lock:
            self._expire_locked()
            if not self.job or not hmac.compare_digest(self.job.id, job_id): fail("NOT_FOUND", 404)
            job, data = self.job, {"id": self.job.id, "status": self.job.status}
            if job.status == "completed" and job.result:
                if job.read: self.job = None; fail("NOT_FOUND", 404)
                data["transcript"] = job.result
                if consume: job.read = True
            elif job.error: data["error"] = job.error
            return data
    def cancel(self, job_id: str) -> None:
        with self.lock:
            if not self.job or not hmac.compare_digest(self.job.id, job_id): fail("NOT_FOUND", 404)
            self.job.cancel.set()
    def _expire_locked(self) -> None:
        if self.job and self.job.completed_at and time.monotonic() - self.job.completed_at > RESULT_TTL_SECONDS: self.job = None


def run_transcription(job: Job, credentials: tuple[str, str] | None = None, opener: Any = urlopen) -> dict[str, Any]:
    try: import yt_dlp
    except ImportError: fail("DEPENDENCY_MISSING", 503)
    account, token = credentials or cloudflare_credentials()
    with tempfile.TemporaryDirectory(prefix="local-asr-") as temp_dir:
        target = str(Path(temp_dir) / "audio.%(ext)s")
        def progress(event: dict[str, Any]) -> None:
            if job.cancel.is_set(): fail("CANCELLED", 409)
        try:
            with yt_dlp.YoutubeDL(downloader_options(target, progress)) as downloader:
                metadata = downloader.extract_info(job.url, download=False)
                duration = metadata.get("duration") if isinstance(metadata, dict) else None
                if not isinstance(duration, (int, float)) or isinstance(duration, bool) or duration <= 0 or duration > MAX_DURATION_SECONDS: fail("UNSUPPORTED_DURATION")
                if job.cancel.is_set(): fail("CANCELLED", 409)
                downloader.extract_info(job.url, download=True)
        except PublicError: raise
        except Exception: fail("DOWNLOAD_FAILED", 502)
        files = list(Path(temp_dir).glob("audio.*"))
        if len(files) != 1: fail("DOWNLOAD_FAILED", 502)
        if job.cancel.is_set(): fail("CANCELLED", 409)
        output_pattern = Path(temp_dir) / "chunk-%03d.mp3"
        try:
            completed = subprocess.run(ffmpeg_command(files[0], output_pattern), check=False, shell=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if completed.returncode: fail("AUDIO_PREPARE_FAILED", 502)
        except PublicError: raise
        except Exception: fail("AUDIO_PREPARE_FAILED", 502)
        if job.cancel.is_set(): fail("CANCELLED", 409)
        chunks = sorted(Path(temp_dir).glob("chunk-*.mp3"))
        if not chunks or len(chunks) > MAX_CHUNKS: fail("AUDIO_PREPARE_FAILED", 502)
        job.status, segments, language = "transcribing", [], "unknown"
        for index, chunk in enumerate(chunks):
            if job.cancel.is_set(): fail("CANCELLED", 409)
            try: audio = chunk.read_bytes()
            except Exception: fail("AUDIO_PREPARE_FAILED", 502)
            chunk_segments, chunk_language = request_transcription(account, token, audio, index * CHUNK_SECONDS, opener)
            if job.cancel.is_set(): fail("CANCELLED", 409)
            segments.extend(chunk_segments)
            if language == "unknown" and chunk_language != "unknown": language = chunk_language
        return structured_result(job.url, language, segments)


class CompanionServer(ThreadingHTTPServer):
    daemon_threads, allow_reuse_address = True, True
    def __init__(self, address: tuple[str, int], origin: str, token: str, runner: Any = run_transcription):
        if address[0] != HOST: raise ValueError("non-loopback bind refused")
        self.origin, self.token, self.jobs = validate_extension_origin(origin), validate_token(token), JobStore(runner)
        super().__init__(address, CompanionHandler)


class CompanionHandler(BaseHTTPRequestHandler):
    server: CompanionServer
    protocol_version = "HTTP/1.1"
    def log_message(self, format: str, *args: Any) -> None: pass
    def _authorized(self) -> bool:
        return (hmac.compare_digest(self.headers.get("Host", ""), f"{HOST}:{self.server.server_port}") and hmac.compare_digest(self.headers.get("Origin", ""), self.server.origin) and hmac.compare_digest(self.headers.get("X-Local-Asr-Token", ""), self.server.token))
    def _send(self, status: int, body: dict[str, Any], preflight: bool = False) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode(); self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(encoded))); self.send_header("Cache-Control", "no-store"); self.send_header("Access-Control-Allow-Origin", self.server.origin); self.send_header("Vary", "Origin")
        if preflight: self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"); self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Local-Asr-Token")
        self.end_headers()
        if status != HTTPStatus.NO_CONTENT: self.wfile.write(encoded)
    def _error(self, error: PublicError) -> None: self._send(error.status, {"error": {"code": error.code}})
    def _guard(self) -> bool:
        if not self._authorized(): self._error(PublicError("UNAUTHORIZED", 403)); return False
        return True
    def do_OPTIONS(self) -> None:
        requested_headers = {value.strip().lower() for value in self.headers.get("Access-Control-Request-Headers", "").split(",") if value.strip()}
        if not (hmac.compare_digest(self.headers.get("Host", ""), f"{HOST}:{self.server.server_port}") and hmac.compare_digest(self.headers.get("Origin", ""), self.server.origin) and self.headers.get("Access-Control-Request-Method", "") in {"GET", "POST", "DELETE"} and requested_headers <= {"content-type", "x-local-asr-token"}): self._error(PublicError("UNAUTHORIZED", 403)); return
        self._send(HTTPStatus.NO_CONTENT, {}, preflight=True)
    def do_GET(self) -> None:
        try:
            if not self._guard(): return
            if self.path == "/v1/health": self._send(200, {"status": "ok"})
            elif match := re.fullmatch(r"/v1/jobs/([a-f0-9]{32})", self.path): self._send(200, self.server.jobs.get(match.group(1), consume=True))
            else: fail("NOT_FOUND", 404)
        except PublicError as error: self._error(error)
    def do_POST(self) -> None:
        try:
            if not self._guard(): return
            if self.path != "/v1/jobs": fail("NOT_FOUND", 404)
            if self.headers.get("Content-Type", "").split(";", 1)[0].lower() != "application/json": fail("UNSUPPORTED_MEDIA_TYPE", 415)
            length = self.headers.get("Content-Length", "")
            if not length.isdigit() or int(length) > MAX_REQUEST_BYTES: fail("REQUEST_TOO_LARGE", 413)
            try: payload = json.loads(self.rfile.read(int(length)).decode("utf-8"))
            except Exception: fail("INVALID_JSON")
            if not isinstance(payload, dict) or set(payload) != {"url"}: fail("INVALID_REQUEST")
            job = self.server.jobs.start(validate_video_url(payload["url"])); self._send(HTTPStatus.ACCEPTED, {"id": job.id, "status": job.status})
        except PublicError as error: self._error(error)
    def do_DELETE(self) -> None:
        try:
            if not self._guard(): return
            match = re.fullmatch(r"/v1/jobs/([a-f0-9]{32})", self.path)
            if not match: fail("NOT_FOUND", 404)
            self.server.jobs.cancel(match.group(1)); self._send(HTTPStatus.ACCEPTED, {"status": "cancelling"})
        except PublicError as error: self._error(error)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(); sub = parser.add_subparsers(dest="command", required=True); sub.add_parser("generate-token"); serve = sub.add_parser("serve"); serve.add_argument("--origin", required=True); serve.add_argument("--token", required=True); serve.add_argument("--host", default=HOST); serve.add_argument("--port", type=int, default=PORT); args = parser.parse_args(argv)
    if args.command == "generate-token": print(secrets.token_urlsafe(32)); return 0
    try:
        cloudflare_credentials(); set_windows_below_normal_priority(); CompanionServer((args.host, args.port), args.origin, args.token).serve_forever()
    except (PublicError, ValueError) as error: print(getattr(error, "code", "INVALID_CONFIGURATION"), file=os.sys.stderr); return 2
    return 0


if __name__ == "__main__": raise SystemExit(main())
