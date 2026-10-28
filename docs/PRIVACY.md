# Privacy and Permissions

Custom AI Browser Assistant is a BYOK browser extension. It does not include a vendor-hosted backend and does not send data to the project author.

## Data Flow

The extension sends content only to an API endpoint configured by the user in the options page. Side-panel requests use the instance selected for that panel session; floating-chat requests use the configured default instance:

```text
Chrome extension -> user-configured Base URL -> user-selected model provider
```

Depending on the user action, the request may include:

- Chat messages typed into the side panel.
- Current page or selected-region text when the user sends a side panel question from a webpage.
- Current page or selected text when the user sends a message from an in-page floating chat window.
- Selected text from the active page.
- Extracted text from the active page.
- YouTube page metadata, description, visible transcript, and visible page text.
- When explicitly enabled after platform subtitles are unavailable, a supported active YouTube/Bilibili URL is sent to the user-started loopback helper at `127.0.0.1:8765`. This user-triggered fallback is disabled by default. The helper downloads the audio, re-encodes it into bounded 20-minute MP3 chunks, uploads chunks sequentially to Cloudflare Workers AI for transcription, and cleans up temporary local media. Cloudflare Account ID and API token stay only in the helper environment and are never stored by the extension. The resulting transcript is sent to the user's configured chat model for the requested summary.
- PDF page metadata and any extractable visible text.
- Screenshot image data when the user clicks screenshot Q&A, and only when the selected instance is explicitly configured as vision-capable.
- Saved-page library snapshots when the user asks questions against saved content.
- Current page or selected-region text when the user explicitly starts TTS playback.
- On the first user-triggered page-grounded operation for an origin, page type, and operation without a usable local recipe, bounded local candidate labels and previews for that action. The selected configured model receives one non-streaming planning request and can return only candidate IDs.
- A bounded sanitized DOM snapshot only when the user explicitly attaches `网页代码` or asks for allowed page operations. It excludes sensitive form values and inline script/style bodies; the configured model receives it only for that explicit question or operation request.

No page content is sent automatically on page load. User action is required. Side-panel questions can include current-page, selected-region, selected-text, or explicit screenshot context; floating-chat questions can include current-page or selected-text context. TTS text is sent only when the user clicks the read control, and only to the configured TTS endpoint. A blank TTS URL inherits the selected chat endpoint. A blank TTS key inherits the chat key only when the normalized endpoints match, including path and query; a separate TTS endpoint requires its own key.

The floating-chat composer runs in an extension-origin frame. Each send requires a trusted user action inside that frame; page-script submit events and messages cannot authorize a request. The surrounding floating conversation remains in page DOM, so the host page can read displayed messages, answers, and session previews. Use the side panel when that page access is unsuitable.

## Local Storage

The extension stores the following data in `chrome.storage.local`:

- API settings, including global TTS settings, system prompt, and preferences.
- Local chat-model instances: name, provider preset, Base URL, API key, model, and explicit vision capability; one instance is the default.
- Recent conversation history, if enabled.
- Saved-page library snapshots.
- In-page floating chat sessions, grouped by webpage URL. These store source metadata, text excerpts, chat messages, and compressed memory summaries. Screenshot image data is used for the model request but is not stored in floating session memory.
- Page recipes keyed by origin, page type, and operation. A recipe contains only locally validated selector signatures and timestamps; it does not contain page text, DOM snapshots, raw planner output, or model-authored selectors.

Users can export or import this data from the options page. Backups include model instances and page recipes, but do not include any API keys or loopback-helper token by default; exporting those values requires the explicit include-keys opt-in. Generated TTS audio and its source text are ephemeral: they are not stored in conversation history or backups. Users can also clear stored conversation history and delete saved pages from the side panel.

Merge import retains a stored chat or TTS key only for the same normalized effective endpoint. A matching model-instance ID alone does not authorize key reuse at a changed URL. Explicit keys in a backup apply to the imported endpoints; replace import does not inherit stored keys. The loopback-helper token still targets the fixed local helper.

Confirmed background page-task definitions use `chrome.storage.session`, not `chrome.storage.local`, and are never included in backups. They disappear when Chrome restarts. Page writes from a confirmed plan occur only in the pinned target page; the feature has no arbitrary JavaScript execution, `chrome.debugger`, cookie access, or browser credential access.

## Permissions

- `activeTab`: lets the extension interact with the current tab after user action.
- `contextMenus`: enables right-click actions for selected text and page summaries.
- `scripting`: supports controlled content-script workflows.
- `sidePanel`: provides the main assistant interface.
- `storage`: stores settings, history, and saved pages locally.
- `tabs`: supports active tab lookup and visible-tab screenshot capture.
- `<all_urls>` host access: broadens host permission so explicit user-triggered `captureVisibleTab` screenshots work inside the extension side panel. The in-page “图” shortcut only opens that protected extension surface; screenshot data is never returned to page DOM. Content-script injection remains limited to the HTTP/HTTPS match patterns declared in the manifest, and screenshots are never captured automatically.

## API Keys

API keys are stored locally in Chrome extension storage. Chat keys are included only in requests sent to the selected model-instance endpoint; TTS keys are included only in requests sent to the configured or inherited TTS endpoint.

Do not configure an API endpoint you do not trust. If the endpoint is remote, page content and prompts sent through the extension may be processed by that remote service.

## Project Scope

This project does not modify Monica or bypass any third-party paid feature. It is an independent extension that implements similar browser assistant workflows with user-provided model access. It has no vendor backend, automatic page-load transmission or screenshot capture, or Chrome Web Store publication as part of this release.
