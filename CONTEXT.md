# Project Context

## Objective and Acceptance

### Current Brief

Deliverables:

- Preserve the already-installed baseline with a local checkpoint commit (`863dbc1`).
- Reorganize the side panel so secondary tools are grouped and the conversation area is materially larger.
- Add text-to-speech for the current readable page context, reusing the existing selected-region workflow for partial-page reading.
- Let the user configure an OpenAI-compatible TTS endpoint, API key, model, voice, speed, and request timeout.
- Provide clear playback, stop, progress, and error states without storing generated audio.
- Produce a verified `dist` build and `releases/custom-ai-browser-assistant.zip`.

Non-goals:

- No Bilibili-specific danmaku API scraping or continuous live-danmaku ingestion in this version; the generic selected-region reader covers text present in the page DOM.
- No vendor backend, account system, deployment, Chrome Web Store publication, or automatic mutation of the user's installed extension.
- No new UI framework or SDK dependency unless the existing native HTML/CSS/JS surface proves insufficient.
- No image/video generation or semantic knowledge-base work.

File scope:

- Side-panel layout and behavior: `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`, `src/sidepanel/sidepanel.js`.
- TTS settings and secret handling: `src/options/options.html`, `src/options/options.js`, `src/options/options.css`, `src/shared/defaults.js`, `src/shared/backup.js`, `test/backup.test.js`.
- TTS request and chunking contract: new `src/shared/tts.js` plus `test/tts.test.js`.
- Build/release metadata and required product/privacy docs: `manifest.json`, `package.json`, `scripts/check-extension.js`, `scripts/audit-release.js`, `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/PRIVACY.md`.

Acceptance commands and evidence:

- `node --test test/tts.test.js` passes TTS URL, payload, fallback, and chunking checks.
- `npm run verify` passes tests, lint, import audit, build, package, and release audit.
- Rendered side-panel smoke check shows grouped tools, a larger conversation surface, and accessible TTS controls at narrow Chrome side-panel width.
- Static release inspection confirms the TTS module and UI are present in `dist` and the release zip.

Stop conditions:

- Stop implementation if a provider-specific contract beyond OpenAI-compatible `POST /audio/speech` is required.
- Stop if the feature requires Bilibili private APIs, authentication, DRM bypass, a new remote backend, deployment, or Chrome installation/reload.
- Stop and return to root if file scope must expand into an unapproved architecture, security, or data contract.
- Preserve all unrelated untracked screenshots, `outputs/`, `work/`, and `.playwright-mcp/` content.

## Constraints, Authority, and Do-Not-Change

- Root owns product scope, TTS contract, integration, and final acceptance.
- Use the existing selected-region extraction instead of adding a second page-selection system.
- Keep API keys in `chrome.storage.local`; do not log, transmit, or include them in backups unless the existing explicit opt-in permits it.
- Remote TTS endpoints must use HTTPS; localhost loopback may use HTTP, matching the existing chat endpoint policy.
- Generated speech is ephemeral and must not be persisted in history or backup data.

## Current Work: Done / Active / Blocked

- Done: inspected repository purpose, current entry points, page extraction, side-panel flow, settings, and privacy model.
- Done: baseline `npm run verify` passed with 83 tests and a valid package.
- Done: committed the pre-existing iframe/floating-dock/UI-state changes as `863dbc1`.
- Done: TTS core/settings/security implementation; focused root rerun passed 12 tests plus lint and import audit.
- Done: grouped side-panel UI, independent TTS playback, version metadata, docs, and initial release packaging.
- Done: resolved independent-review findings in backup merge secret preservation, failed TTS queue termination, and release-audit coverage.
- Blocked: none. OpenViking continuity lookup was unavailable because the local service could not be reached; live repository evidence is authoritative.
- Routing evidence: requested `gpt-5.3-codex-spark xhigh` via `codex-cli 0.144.4`; the worker's writes/tests were sandbox-declined, it expanded beyond the assigned slice, and it never emitted `turn.completed`, so it was terminated with no worktree changes and rerouted to `gpt-5.6-terra medium`.

## Reasoning State: Confirmed / Provisional / Ruled Out / Unresolved

- Confirmed: selected-region text already flows through `EXTRACT_PAGE`, so TTS can read a webpage subset without new content-script code.
- Confirmed: the extension has no runtime dependencies and already supports user-configured OpenAI-compatible endpoints.
- Confirmed: use OpenAI-compatible `POST /audio/speech` with MP3 output as the first TTS contract; the official API limit is 4,096 input characters, so chunks are capped at 3,500 characters.
- Ruled out: adding a component SDK solely for visual grouping; native semantic controls and CSS are sufficient.
- Unresolved: live provider audio cannot be end-to-end verified without user credentials; request construction and playback integration will be tested locally.

## Decisions and Contracts

- A blank TTS Base URL and API key inherit the chat Base URL and API key; TTS model remains explicit.
- TTS input is split into bounded sequential chunks so longer selected regions can play without one oversized request.
- TTS has independent abort/playback state so listening can continue while the chat remains usable; a dedicated Stop control aborts pending speech, pauses audio, revokes its object URL, and prevents later chunks.
- The side panel keeps only `总结页面`, `朗读当前上下文`, and `选择区域` as primary actions. Remaining page, screenshot, translation, writing, history, and library tools move into collapsed native `<details>` groups.
- Remove the duplicate `问当前页` button because normal composer submission already attaches current page or selected-region context.
- Use native `<details>`, `<audio controls>`, and `<progress>` components rather than adding a UI SDK dependency.
- `ttsApiKey` follows the same backup redaction and explicit opt-in rules as `apiKey`.

## Pending List

- None.

## Verification and Remaining Risk

- Baseline verification: `npm run verify` passed before new implementation.
- Initial integrated verification: `npm run verify` passed with 89 tests plus lint, import audit, build, package, and release audit; visual smoke at 390x900 showed no horizontal overflow and a materially larger collapsed conversation area.
- Independent review: P1 backup-key loss, P2 failed-queue re-entry, and P3 release-audit coverage were fixed; focused post-fix review found no open material findings. Removed tool-scroll persistence is accepted because the tool collection is now collapsed and bounded.
- Final focused verification: 13/13 backup and TTS tests passed.
- Final integrated verification: `npm run verify` passed with 90 tests plus lint, import audit, build, package, and release audit.
- Final release inspection: `dist/manifest.json` is MV3 version 0.2.0; the TTS module, side-panel read action, and TTS settings exist in both `dist` and `releases/custom-ai-browser-assistant.zip`.
- Remaining risk: browser autoplay policies may require the initial speech request to originate from a direct user click; the UI must preserve that path.
- Remaining risk: provider-specific voice names and maximum input sizes vary; configurable model/voice and conservative chunking limit compatibility risk.
- Remaining risk: live-provider audio and the already-installed Chrome copy were not exercised because credentials and extension reload were outside this task's authorized scope.

## Remaining Work

- None.

## Exact Next Action

- None; the implementation and release artifacts are ready for user reload/testing.

## Handoff and Completion Gate

- Completion requires all acceptance commands, diff review, packaged artifacts, updated context, and no unresolved material review finding.
