# Project Context

## Current Brief

This turn's only goal: finish the low-cost video-summary path: use platform subtitles first, upload audio to Cloudflare Whisper when timed text is unavailable, and preserve clickable evidence timestamps.

### Deliverables

- On supported YouTube and Bilibili video pages, `总结` first attempts to obtain a complete platform subtitle track instead of depending on an already-open transcript DOM.
- Subtitle text is normalized with timestamps where available and then reuses the existing long-page chunking and final-synthesis pipeline.
- When usable timed text is unavailable, the existing loopback companion downloads/extracts audio from the validated active video, chunks it, and uploads only those audio chunks to Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`.
- Cloudflare Account ID and API token are supplied to the helper process, never sent by the extension, returned over loopback, logged, or persisted in extension storage/backups.
- The result clearly identifies its evidence source: platform subtitles, Cloudflare ASR, or visible page text.
- When timed platform subtitles or Cloudflare ASR are used, summary prompts preserve evidence timestamps and the final assistant answer turns bracketed `MM:SS` / `HH:MM:SS` citations into safe, persistent links.
- Clicking a generated timestamp on the same active YouTube/Bilibili video seeks the page's native `<video>` element; a history link for another supported video navigates to the validated source-time URL.
- Existing model instances, chat history, floating sessions, and page-summary behavior remain compatible.
- Work is isolated on branch `codex/video-summary-subtitles-asr`.

### Non-goals

- No Gemini, TwelveLabs, visual-frame extraction/understanding, Qwen-VL, full-video multimodal upload, generic arbitrary-site media downloading, GPU inference, or automatic system-wide dependency installation.
- Do not reset or migrate existing model configuration, history, or floating-session storage.
- Do not promise that DRM, private, age-restricted, login-only, or unsupported videos can be downloaded or transcribed.
- Do not make arbitrary model-authored URLs clickable, link timestamps without timed transcript evidence, or add a general-purpose Markdown/browser navigation surface.
- Do not push, merge, publish a release, overwrite the installed Chrome extension, or call a paid/live model provider without a separate request.

### Verified Environment

- CPU: AMD Ryzen 7 9700X, 8 cores / 16 threads.
- RAM: 31.6 GB.
- GPU: NVIDIA GeForce RTX 5070 Ti, 16 GB VRAM; the Cloudflare path does not run a local model or use the GPU.
- FFmpeg 8.1.1 is installed. The existing E:-drive CPython 3.11 `local-asr/.venv/` contains `yt-dlp 2026.07.04`; an older unused `faster-whisper` installation remains in that ignored venv but is no longer imported or required.
- Current baseline is commit `5bb781c` from `codex/selection-floating-actions`; unrelated untracked browser artifacts must be preserved.

### File and Contract Scope

- Extension investigation/implementation: `src/content/contentScript.js`, `src/background.js`, `src/sidepanel/sidepanel.js`, minimal shared transcript/ASR helpers, options/default/storage surfaces only when required, manifest permissions only when justified, and focused tests.
- Local companion: reuse the existing loopback job API and Python entry point; keep only media download/chunking plus a dependency-free Cloudflare REST client and focused tests using fakes. Generated media remains temporary and untracked.
- The side panel remains the orchestrator for page summary. Platform extraction and loopback calls return normalized transcript data rather than model responses.
- Timestamp-link implementation is bounded to summary prompts, one pure validator/linkifier, the existing Markdown renderer, and side-panel click/seek handling; no storage migration is allowed.
- Any background or companion fetch must validate platform hosts and identifiers; it must not become an arbitrary URL fetch proxy.

### Settled Decisions

- Platform subtitles remain the default fast path. Cloudflare ASR runs only when subtitles are unavailable.
- Cloudflare ASR uses `@cf/openai/whisper-large-v3-turbo`, sequential bounded audio chunks, `vad_filter=true`, and returned segment/VTT timing. It replaces the blocked local Whisper model path; no local model or CUDA path remains.
- Platform subtitles and Cloudflare ASR feed the existing text chunking/summarization flow instead of creating a second summarizer.
- Stage 1 runs from the side panel: it reads bounded player metadata with `chrome.scripting.executeScript({ world: "MAIN" })`, then fetches only validated YouTube timed-text or Bilibili subtitle endpoints. It does not add a background fetch proxy or new manifest permission.
- Subtitle track selection is deliberately minimal: first valid human YouTube track, otherwise first valid automatic track; first valid Bilibili track. Failed platform extraction honestly falls back to visible transcript/page text unless local ASR is enabled.
- The ASR helper remains a single-job HTTP service bound only to `127.0.0.1:8765`. Every request requires the configured exact `chrome-extension://` Origin plus a random token; both extension and helper validate canonical YouTube/Bilibili URLs independently.
- Cloud ASR is disabled by default. The helper requires explicit Cloudflare credentials at startup and health-checks configuration without making a paid model request.
- The companion uses one in-memory job, strict structured errors, best-effort cancellation, bounded audio chunks, temporary media cleaned in `finally`, and Below Normal Windows process priority. It accepts no cookies, proxy, paths, model names, provider credentials, or arbitrary request headers from the extension.
- This feature bumps extension/package metadata to `0.4.0`, but no release or external push is authorized.
- No subtitle or transcript body is persisted outside existing user-visible conversation history unless the user already uses the saved-page feature.
- Timestamp links are generated locally from validated source URLs and evidence timestamps after the model response, then persist as part of the existing assistant Markdown content. Same-page seeking uses a bounded main-world script that only sets `document.querySelector("video").currentTime`.
- Live platform/API behavior must be reported separately from unit/build verification.

### Approved Task Graph

1. Investigate the smallest safe Bilibili-conclusion request and Cloudflare helper conversion against the current uncommitted implementation. The Bilibili endpoint is deferred because it requires authenticated WBI signing and can enqueue generation.
2. Replace the local-model runner with bounded audio preparation plus Cloudflare REST transcription; keep the loopback extension contract stable where practical.
3. Update evidence labels/options/docs/tests and explicitly omit visual-frame processing.
4. Fresh independent review, one correction batch if needed, full verification, and continuity reconciliation.

### Acceptance Commands and Evidence

- Focused JavaScript tests cover platform detection, track selection, transcript normalization, source labeling, URL/host rejection, and cloud-ASR helper failure states.
- Focused JavaScript tests cover timestamp parsing, code-fence/inline-code exclusion, supported-video URL validation, generated link persistence, and rejection of spoofed or mismatched links.
- Focused Python tests cover loopback binding/configuration, token/origin checks, URL allowlisting, Cloudflare credential validation, endpoint construction, bounded chunks, response parsing/timestamp offsets, cleanup, and structured errors without downloading media or calling Cloudflare.
- `npm run verify`
- Python syntax/tests using the existing E:-drive CPython 3.11 environment.
- `git diff --check`
- Inspect the final diff for permissions, SSRF/local-service exposure, provider-credential secrecy, cloud-upload disclosure, request-size bounds, cleanup, cancellation, and unrelated files.

### Verification and Remaining Risk

- Platform-subtitle extraction, long-summary reuse, timed citations, safe timestamp links, stale-content-script guards, and the optional loopback fallback are implemented on `codex/video-summary-subtitles-asr`.
- The helper now uses only `yt-dlp`, FFmpeg, and Python stdlib at runtime: it validates supported video URLs, prepares sequential 20-minute mono 16 kHz/48 kbps MP3 chunks, uploads them to fixed Cloudflare Workers AI Whisper Large V3 Turbo, and normalizes bounded timed segments. Provider credentials remain helper-only environment values.
- Independent review found a P1 provider-shape gap and a P2 timestamp-validation gap. Corrections added strict WebVTT fallback, per-chunk time bounds with five-second encoder tolerance, and monotonic ordering for both WebVTT and raw segments; final independent re-review returned `PASS`.
- Final fresh root verification passed: `npm run verify` (152/152 tests plus manifest/import/build/package/release audits), 11/11 dependency-free Python tests, Python compilation, and `git diff --check`.
- Review covered subtitle URL validation, stale-tab checks, backup token redaction, loopback Origin/Host/token authentication, media URL allowlisting, fixed Cloudflare endpoint and secret handling, request/response bounds, WebVTT/segment timing, cleanup, cancellation, fallback behavior, and explicit cloud-upload disclosure.
- The user explicitly rejected visual keyframe analysis as slow and poor-quality; no frame extraction, Qwen-VL, full-video multimodal upload, local model, or GPU path was added.
- Platform globals/endpoints, real extension CORS, live yt-dlp/FFmpeg media preparation, Cloudflare authentication/billing/schema behavior, Chrome runtime, and live timestamp seeking remain unverified. No helper server, media download, upload, paid provider request, Chrome overwrite, push, merge, or release occurred.

### Stop Conditions

- Stop and return to root if a stable subtitle path requires user credentials, undocumented credential extraction, DRM bypass, arbitrary URL proxying, or a new storage migration.
- Stop if implementation requires cookie extraction/export, a new storage migration, arbitrary URL proxying, system-wide package installation, or a background service installation.
- Stop before external push, merge, release, Chrome installation, paid request, or live user-media upload.

## Pending List

- YouTube/Bilibili player globals and subtitle endpoints remain undocumented runtime contracts; unit tests cannot prove live availability.
- Bilibili's AI-conclusion endpoint is intentionally deferred: it requires the signed-in account's `SESSDATA` plus volatile WBI signing, and a nominal no-summary response can enqueue generation. Do not copy cookies or add a signer merely for this fallback.
- Cloudflare Account ID/API token are not yet configured, so offline mocks can be verified but no live transcription can run.
- The extension build/package exists, but browser-runtime acceptance and real subtitle/Cloudflare-ASR validation remain pending until Chrome is explicitly updated and credentials are configured.
- Cancellation before the local helper returns a job ID cannot target that job; the helper may need a restart if this rare timing occurs.
- Pages that were already open when the extension was updated must still be refreshed to load the new content-script context.
- Live timestamp seeking on YouTube/Bilibili remains pending until the new build is explicitly loaded into Chrome; unit checks must not be reported as live proof.

## Exact Next Action

- None for local implementation. The next gated action is to configure Cloudflare credentials and separately authorize live helper/media/Chrome testing; commit/push, merge, Chrome overwrite, and release also remain separate external actions.
