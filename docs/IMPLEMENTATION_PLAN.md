# Implementation Plan

## Product Scope

This project aims to cover the most common Monica-like browser assistant workflows without copying or modifying Monica:

| Area | MVP Status | Notes |
| --- | --- | --- |
| Side panel chat | Implemented | Streaming and non-streaming OpenAI-compatible chat. |
| Action center | Implemented | Central registry for page, selection, and writing workflows. |
| Custom model config | Implemented | BYOK Base URL, API Key, model, timeout, system prompt. |
| Page summary | Implemented | Reads active page text through content script. |
| Ask current page | Implemented | Uses page title, URL, and extracted text as context. |
| Selected text actions | Implemented | Explain, translate, summarize, rewrite via floating toolbar and context menus. |
| Search assistant | Implemented | Injects an ask button on Google/Bing search pages. |
| Writing assistant | Implemented | Polishes focused editable fields and writes result back. |
| Local history | Partial | Saves recent conversations; full history browser is planned. |
| Long page chunking | Implemented | Splits long pages, summarizes chunks, then synthesizes final summary. |
| Provider presets | Implemented | OpenAI, OpenRouter, Ollama, LM Studio, One API/New API, custom. |
| PDF/YouTube | Planned | Needs dedicated extractors and fallback UX. |
| Knowledge base | Planned | IndexedDB storage and retrieval layer. |
| Image/video generation | Out of scope for MVP | Can be added through provider-specific tools later. |

## Architecture

The extension is split into browser-facing modules and pure shared modules:

- `src/background.js`: side panel opening, context menus, keyboard commands, message routing.
- `src/content/contentScript.js`: page extraction, selected-text toolbar, search panel, editable-field operations.
- `src/sidepanel/*`: chat UI and page/selection/search/writing workflows.
- `src/options/*`: BYOK configuration.
- `src/shared/*`: API client, prompts, text processing, storage helpers.
- `test/*`: Node tests for pure logic.

The shared modules are intentionally independent from Chrome APIs where possible so they can be tested with Node.

## Quality Gates

Run before shipping:

```powershell
npm run verify
```

This executes:

- `node --test`
- manifest and required-file checks
- dist build

## Browser Install

```powershell
cd E:\codes\custom-ai-browser-assistant
npm run build
```

Then load:

```text
chrome://extensions -> Developer mode -> Load unpacked -> E:\codes\custom-ai-browser-assistant\dist
```

## Next Iterations

1. Add richer history search, rename, pin, and delete actions.
2. Add YouTube transcript extraction.
3. Add PDF extraction through a local helper service or PDF.js-based reader.
4. Add IndexedDB knowledge base and local semantic search.
5. Add optional provider-specific image generation tools.
