# Privacy and Permissions

Custom AI Browser Assistant is a BYOK browser extension. It does not include a vendor-hosted backend and does not send data to the project author.

## Data Flow

The extension sends content only to the API endpoint configured by the user in the options page:

```text
Chrome extension -> user-configured Base URL -> user-selected model provider
```

Depending on the user action, the request may include:

- Chat messages typed into the side panel.
- Current page or selected-region text when the user sends a side panel question from a webpage.
- Current page, selected text, or screenshot context when the user sends a message from an in-page floating chat window.
- Selected text from the active page.
- Extracted text from the active page.
- YouTube page metadata, description, visible transcript, and visible page text.
- PDF page metadata and any extractable visible text.
- Screenshot image data when the user clicks screenshot Q&A.
- Saved-page library snapshots when the user asks questions against saved content.
- Current page or selected-region text when the user explicitly starts TTS playback.

No page content is sent automatically on page load. User action is required. When the user sends a side panel or floating-chat question on a readable webpage, the extension includes the current page, selected-region, selected-text, or screenshot context for that action. TTS text is sent only when the user clicks the read control, and only to the configured TTS endpoint.

## Local Storage

The extension stores the following data in `chrome.storage.local`:

- API settings, including chat/TTS Base URLs, API keys, models, system prompt, and preferences.
- Recent conversation history, if enabled.
- Saved-page library snapshots.
- In-page floating chat sessions, grouped by webpage URL. These store source metadata, text excerpts, chat messages, and compressed memory summaries. Screenshot image data is used for the model request but is not stored in floating session memory.

Users can export or import this data from the options page. Backups do not include chat or TTS API keys by default; exporting either key requires the explicit API-key opt-in. Generated TTS audio and its source text are ephemeral: they are not stored in conversation history or backups. Users can also clear stored conversation history and delete saved pages from the side panel.

## Permissions

- `activeTab`: lets the extension interact with the current tab after user action.
- `contextMenus`: enables right-click actions for selected text and page summaries.
- `scripting`: supports controlled content-script workflows.
- `sidePanel`: provides the main assistant interface.
- `storage`: stores settings, history, and saved pages locally.
- `tabs`: supports active tab lookup and visible-tab screenshot capture.
- `host_permissions`: allows content scripts and local/API requests for user-configured sites and endpoints.

## API Keys

API keys are stored locally in Chrome extension storage. Chat and TTS keys are included only in requests sent to their configured endpoints.

Do not configure an API endpoint you do not trust. If the endpoint is remote, page content and prompts sent through the extension may be processed by that remote service.

## Project Scope

This project does not modify Monica or bypass any third-party paid feature. It is an independent extension that implements similar browser assistant workflows with user-provided model access.
