# Implementation Plan

## Product Scope

This project aims to cover the most common Monica-like browser assistant workflows without copying or modifying Monica:

| Area | MVP Status | Notes |
| --- | --- | --- |
| Side panel chat | Implemented | Streaming and non-streaming OpenAI-compatible chat; each panel session starts on the configured default and can select a local model instance for chat and page actions. |
| In-page floating chat | Implemented | Selection, page, and screenshot triggers open independent floating chat windows near the source; sessions are stored per webpage. |
| Action center | Implemented | Central registry for page, selection, and writing workflows. |
| Custom model config | Implemented | Multiple local BYOK instances with name, preset, Base URL, API key, model, and explicit vision flag; options supports add, edit, duplicate-as-new, delete, and default selection. |
| Page summary | Implemented | Reads active page text through content script. |
| Ask current page | Implemented | Uses page title, URL, and extracted text as context. |
| Page translation/rewrite | Implemented | In-page translation identifies readable text blocks, underlines source text, and inserts translations below the original DOM nodes. |
| Page region picker | Implemented | Side panel can start an element picker; the chosen DOM area becomes the active page context. |
| Text to speech | Implemented | Reads current-page or selected-region text through a global OpenAI-compatible `/audio/speech` endpoint; blank TTS URL/key inherit the selected chat instance, and audio is not entered into chat history. |
| Selected text actions | Implemented | Explain, translate, summarize, rewrite via floating toolbar and context menus. |
| Search assistant | Implemented | Injects an ask button on Google/Bing search pages. |
| Writing assistant | Implemented | Polishes focused editable fields and writes result back. |
| Local history | Partial | Saves recent conversations, shows a compact history list, and supports clearing stored history. |
| Saved-page library | Implemented | Saves active pages, searches local snapshots, asks questions grounded in saved content, and deletes saved pages. |
| Backup/restore | Implemented | Options exports/imports settings, model instances, recipes, history, saved pages, and floating sessions; all API keys are redacted unless include-keys is explicitly selected. |
| Screenshot Q&A | Implemented | Captures the visible tab, previews it in the side panel, then sends an OpenAI-compatible image message only when the selected instance is explicitly vision-capable. |
| Long page chunking | Implemented | Splits long pages, summarizes chunks, then synthesizes final summary. |
| Provider presets | Implemented | OpenAI, OpenRouter, Ollama, LM Studio, One API/New API, custom. |
| YouTube/Bilibili extraction | Implemented | Detects video pages; YouTube extracts title, channel, description, visible transcript, and page text, while Bilibili extraction targets the readable top frame. |
| Page recipe planning | Implemented | A first user-triggered page-grounded operation may make one non-streaming planning call with bounded local candidate labels/previews. Only returned candidate IDs are accepted; selectors/signatures are generated and validated locally, and stale recipes fall back or replan. |
| PDF detection | Partial | Detects PDF pages and provides a graceful fallback until a dedicated parser is added. |
| Knowledge base | Planned | IndexedDB storage and retrieval layer. |
| Image/video generation | Out of scope for MVP | Can be added through provider-specific tools later. |

## Architecture

The extension is split into browser-facing modules and pure shared modules:

- `src/background.js`: side panel opening, context menus, keyboard commands, floating chat model requests, screenshot capture, and message routing.
- `src/content/contentScript.js`: top-frame page extraction, bounded local page-candidate generation, selected-text toolbar, search panel, editable-field operations, region picking, in-page translation DOM updates, and floating chat UI.
- `src/sidepanel/*`: per-panel native model selection plus chat and page/selection/search/writing workflows.
- `src/options/*`: local model-instance and global TTS configuration.
- `src/shared/modelInstances.js`: model-instance migration, validation, default selection, and resolved request settings.
- `src/shared/pageRecipes.js`: origin/page-type/operation recipe keys plus candidate-ID and selector-signature validation.
- `src/shared/tts.js`: OpenAI-compatible speech request validation and conservative text chunking.
- `src/shared/*`: API client, prompts, text processing, storage helpers, model instances, and page recipes.
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
- static relative-import checks
- dist build
- zip packaging
- release audit for installable artifacts and core files

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
2. Add richer translation controls such as language override per page and style settings.
3. Add an explicit YouTube transcript opener/helper when transcript is not visible.
4. Add PDF extraction through a local helper service or PDF.js-based reader.
5. Upgrade the saved-page library from Chrome storage to IndexedDB and add local semantic search.
6. Add optional provider-specific image generation tools.
