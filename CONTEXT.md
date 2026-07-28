# Project Context

## Current Brief

This turn's only goal: deliver a branch-only `0.3.8` extension that makes webpage material an opt-in composer tag and renders assistant Markdown safely, including a one-click code-copy control.

### Deliverables

- Show the readable current page or selected region as an optional tag directly above the side-panel composer. Clicking it toggles whether that material is included in the next ordinary chat request.
- When no page material is readable, hide the tag and keep ordinary chat available as an AI assistant; do not add a red “网页未读取” message.
- Preserve explicit page actions (summary, read, save, translation) as page-bound operations.
- Render assistant Markdown with safe DOM construction and provide a copy button on fenced code blocks.
- Bump `manifest.json` and `package.json` to `0.3.8`, then build the local plugin package on this branch.

### Non-goals

- No provider request, Chrome reload, Web Store publication, remote push, permission/storage-schema change, UI framework, dependency, or page-text persistence.
- No changes to floating-page chat, screenshot ownership, selected-region capture, page actions, or unrelated untracked artifacts.
- No raw HTML from models or webpages may become DOM markup.

### File Scope

- `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`, and `src/sidepanel/sidepanel.js`
- One small shared Markdown parser/renderer helper and focused Node tests
- `manifest.json`, `package.json`, `README.md`, and this context file

### Settled Decisions

- The context tag is opt-in and starts deselected. A selected-region tag takes precedence over the ordinary-page tag. Page/tab changes clear the opt-in state with the existing conversation reset.
- Ordinary chat with no selected tag sends only the user prompt and existing system/history messages. If an opted-in page becomes unavailable before sending, the tag is cleared and the prompt remains ordinary chat without a red error.
- Assistant output supports headings, paragraphs, lists, block quotes, inline code, fenced code blocks, and plain text. Build nodes with `textContent`; do not parse model output with `innerHTML`.
- Fenced code blocks expose one copy button that writes the exact code text through the browser clipboard API. Copy failure is presented locally without changing the answer or sending another model request.

### Acceptance Commands

- `node --test test/markdown.test.js test/prompts.test.js`
- `npm run verify`
- `git diff --check`
- Inspect the built `releases/custom-ai-browser-assistant.zip` and confirm it contains version `0.3.8` metadata.

### Verification and Remaining Risk

- Baseline `npm test` passed 125 tests before implementation. Final focused tests passed 4 tests; final `npm run verify` passed 127 tests plus lint, import audit, build, package, and release audit; `git diff --check` passed.
- The rebuilt ZIP contains `manifest.json` version `0.3.8` and the Markdown helper. An independent Terra review found one selected-region opt-in widening defect; it was fixed and the re-review found no P0-P3 issue.
- Source/package acceptance is complete. Browser rendering and Clipboard API behavior still require a user-operated unpacked-extension reload; no live provider request is needed.

### Stop Conditions

- Stop if the change needs a dependency, permission, storage migration, raw HTML rendering, provider request, Chrome reload, publication, remote push, or changes outside the listed files.
- Preserve `.playwright-cli/`, `.playwright-mcp/`, `outputs/`, `work/`, and the existing preview PNG files.

## Pending List

- Browser runtime acceptance remains a separate user-operated Chrome reload step; local source/package verification is the completion boundary for this turn.
- Do not merge to `master`, publish, push, or send a provider request as part of this task.
