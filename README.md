# Custom AI Browser Assistant

Custom AI Browser Assistant is a Manifest V3 Chrome extension inspired by common Monica-style workflows: side panel chat, page summarization, selected-text actions, search assistance, and writing help.

It does not depend on Monica, does not bypass any third-party paid feature, and uses a BYOK setup. You configure your own OpenAI-compatible endpoint, API key, and model.

## Features

- Side panel chat with streaming responses.
- Configurable OpenAI-compatible `Base URL`, `API Key`, and `Model`.
- Current page summarization and question answering.
- Selected-text actions: explain, translate, summarize, rewrite.
- Right-click context menu actions.
- Search result assistant panel for Google and Bing.
- Writing helper for focused text fields and contenteditable editors.
- Local conversation history in Chrome storage.
- Keyboard shortcuts for opening the assistant and page summaries.

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
```

The extension intentionally uses plain JavaScript modules and no frontend build framework. This keeps the loaded unpacked extension close to the source and makes browser debugging straightforward.

See `docs/IMPLEMENTATION_PLAN.md` for the feature matrix and roadmap.
