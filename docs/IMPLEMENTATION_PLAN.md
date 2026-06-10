# Implementation Plan

## Product Scope

This project aims to cover the most common Monica-like browser assistant workflows without copying or modifying Monica:

| Area | MVP Status | Notes |
| --- | --- | --- |
| Side panel chat | Implemented | Streaming and non-streaming OpenAI-compatible chat. |
| Custom model config | Implemented | BYOK Base URL, API Key, model, timeout, system prompt. |
| Page summary | Implemented | Reads active page text through content script. |
| Ask current page | Implemented | Uses page title, URL, and extracted text as context. |
| Selected text actions | Implemented | Explain, translate, summarize, rewrite via floating toolbar and context menus. |
| Search assistant | Implemented | Injects an ask button on Google/Bing search pages. |
| Writing assistant | Implemented | Polishes focused editable fields and writes result back. |
| Local history | Partial | Saves recent conversations; full history browser is planned. |
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

1. Add a conversation history browser in the side panel.
2. Add a provider preset selector for common OpenAI-compatible services.
3. Add page chunking with map-reduce summarization for very long pages.
4. Add YouTube transcript extraction.
5. Add PDF extraction through a local helper service or PDF.js-based reader.
6. Add IndexedDB knowledge base and local semantic search.
