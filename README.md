# Custom AI Browser Assistant

Custom AI Browser Assistant is a Manifest V3 Chrome extension inspired by common Monica-style workflows: side panel chat, page summarization, selected-text actions, search assistance, and writing help.

It does not depend on Monica, does not bypass any third-party paid feature, and uses a BYOK setup. You configure your own OpenAI-compatible endpoint, API key, and model.

## Features

- Side panel chat with streaming responses; attach readable current-page or selected-region context only when needed.
- Safe Markdown answers in the side panel, including one-click copying for fenced code blocks.
- In-page floating chat windows for selected text, current page, or visible-tab screenshots.
- Multiple isolated floating chat sessions per webpage with local memory and idle compression.
- Multiple configurable local model instances, each with a name, provider preset, OpenAI-compatible `Base URL`, `API Key`, model, and explicit vision capability; options supports add, edit, duplicate-as-new, delete, and a default instance.
- The side panel starts each session on the default instance and uses its native model selector for chat and page actions; floating chat uses the configured default.
- Configurable OpenAI-compatible TTS endpoint, API key, model, voice, speed, and timeout; current-page or selected-region text can be read aloud in chunks.
- Current page summarization and question answering.
- Action center for page analysis and writing tasks.
- Monica-style in-page translation that underlines original text and inserts translated text below it.
- Page region picker for narrowing Q&A and translation to a selected DOM area.
- Selected-text actions: explain, translate, summarize, rewrite.
- Right-click context menu actions.
- Search result assistant panel for Google and Bing.
- Writing helper for focused text fields and contenteditable editors.
- Local conversation history in Chrome storage.
- Local saved-page library with search and page-grounded Q&A.
- Saved-page deletion and stored conversation history cleanup.
- JSON backup and restore for settings, conversation history, and saved pages.
- Keyboard shortcuts for opening the assistant and page summaries.
- Long page summarization with chunking and final synthesis.
- Provider presets for OpenAI, OpenRouter, Ollama, LM Studio, and One API/New API style gateways.
- YouTube-aware extraction for title, channel, description, visible transcript, and page text; Bilibili video extraction reads the top frame.
- Video summaries first use available platform subtitles. If they are unavailable, an explicitly enabled loopback helper uploads bounded audio chunks from supported YouTube/Bilibili videos to Cloudflare ASR.
- PDF page detection with graceful fallback text handling.
- Screenshot Q&A with automatic visible-tab capture and side panel preview for vision-capable OpenAI-compatible models.
- Screenshot Q&A can also start directly from the in-page quick rail and opens near the trigger position.
- Screenshot paths are blocked for an instance without explicit vision capability. TTS remains global, and blank TTS URL/key inherit the selected chat instance.
- The side-panel `网页代码` tag explicitly attaches a bounded sanitized DOM snapshot for questions. `允许页面操作` asks the model for fixed structured operations, never arbitrary JavaScript; foreground actions require a visible confirmation, while background tasks require a second confirmation and always provide a manual Stop control.
- Page-operation tasks stay pinned to their original tab and document. Same-origin tab tasks may resume after navigation during the current browser session; cross-origin changes pause them, and browser restarts clear them. Task definitions are session-only and are not included in backups.
- Side-panel and floating chat send with Enter and add a newline with Shift+Enter; Chinese, Japanese, and Korean IME composition Enter keys are not sent.
- The first page-grounded operation for a site/page type can make one non-streaming planning request with bounded local candidate labels/previews. The model returns only candidate IDs; selectors are generated and validated locally, then reused as a recipe or replanned if stale.

## Install Locally

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `dist` directory after running:

```powershell
npm run build
```

For development without packaging, you can also load the project root.

The generated `dist` directory is intentionally ignored by Git. Rebuild it locally before loading or publishing the extension.

To create a zip package:

```powershell
npm run package
```

The zip is written to `releases/custom-ai-browser-assistant.zip`.

Backup data from the options page before moving browsers or machines. The JSON export includes settings, model instances, page recipes, history, saved pages, and floating page chat sessions. API keys remain redacted unless you explicitly opt in to include them.

Default shortcuts:

```text
Ctrl+Shift+M: Open assistant
Ctrl+Shift+S: Summarize current page
```

The shortcuts are also shown in the side panel and options page. Chrome shortcut conflicts can be changed at `chrome://extensions/shortcuts`.

## Configure

Open the extension options page and configure one or more model instances, then select the default:

```text
Base URL: https://your-api.example.com/v1
API Key: sk-...
Model: your-model-name
```

The API must support the OpenAI-compatible chat completions endpoint:

```http
POST /chat/completions
```

For page reading, configure global TTS in the options page. It uses the OpenAI-compatible endpoint below; blank TTS URL and key inherit the selected chat instance. Select a page region first when only part of a page should be read.

```http
POST /audio/speech
```

## Optional Cloudflare video transcription fallback

This is disabled by default. It only runs after platform subtitles are unavailable, and only for supported active YouTube/Bilibili URLs. Start the existing `local-asr` helper yourself; the extension neither installs dependencies nor starts a service. The helper needs `yt-dlp` and `ffmpeg`, re-encodes audio into bounded 20-minute MP3 chunks, then uploads those chunks sequentially to Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`. No frames, Qwen, or other multimodal analysis is used.

```powershell
cd local-asr
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
 $env:CLOUDFLARE_ACCOUNT_ID = "YOUR_ACCOUNT_ID"
 $env:CLOUDFLARE_API_TOKEN = "YOUR_API_TOKEN"
.\.venv\Scripts\python.exe asr_companion.py generate-token
.\.venv\Scripts\python.exe asr_companion.py serve --origin chrome-extension://YOUR_32_LOWERCASE_ID --token YOUR_GENERATED_TOKEN
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` only in the helper environment; never enter them in the extension. Copy the generated token to Options, enable Cloudflare video transcription, and use the displayed extension Origin in the command. The helper is fixed at `http://127.0.0.1:8765/v1`; temporary downloaded media and prepared chunks are cleaned up after the job. The resulting timed transcript is then sent to your configured chat model when generating the summary. The loopback token is redacted from normal backups and included only with the existing include-keys option.

## Development

```powershell
npm test
npm run lint
npm run audit:imports
npm run build
npm run package
npm run audit:release
```

The extension intentionally uses plain JavaScript modules and no frontend build framework. This keeps the loaded unpacked extension close to the source and makes browser debugging straightforward.

See `docs/IMPLEMENTATION_PLAN.md` for the feature matrix and roadmap.
See `docs/PRIVACY.md` for data flow and permission details.
