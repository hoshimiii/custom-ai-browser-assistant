# Custom AI Browser Assistant

Custom AI Browser Assistant is a Manifest V3 Chrome extension inspired by common Monica-style workflows: side panel chat, page summarization, selected-text actions, search assistance, and writing help.

It does not depend on Monica, does not bypass any third-party paid feature, and uses a BYOK setup. You configure your own OpenAI-compatible endpoint, API key, and model.

## Features

- Side panel chat with streaming responses.
- Configurable OpenAI-compatible `Base URL`, `API Key`, and `Model`.
- Current page summarization and question answering.
- Action center for page analysis and writing tasks.
- Page-level translation and rewriting.
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
- YouTube-aware extraction for title, channel, description, visible transcript, and page text.
- PDF page detection with graceful fallback text handling.
- Screenshot Q&A for vision-capable OpenAI-compatible models.

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

Backup data from the options page before moving browsers or machines. The JSON export includes settings, history, and saved pages.

Default shortcuts:

```text
Ctrl+Shift+M: Open assistant
Ctrl+Shift+S: Summarize current page
```

## Configure

Open the extension options page and set:

```text
Base URL: https://your-api.example.com/v1
API Key: sk-...
Model: your-model-name
```

The API must support the OpenAI-compatible chat completions endpoint:

```http
POST /chat/completions
```

## Development

```powershell
npm test
npm run lint
npm run build
npm run package
npm run audit:release
```

The extension intentionally uses plain JavaScript modules and no frontend build framework. This keeps the loaded unpacked extension close to the source and makes browser debugging straightforward.

See `docs/IMPLEMENTATION_PLAN.md` for the feature matrix and roadmap.
See `docs/PRIVACY.md` for data flow and permission details.
