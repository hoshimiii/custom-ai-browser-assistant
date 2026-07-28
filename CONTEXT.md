# Project Context

## Current Brief

### Deliverables

- Ship a `0.3.7` per-model reasoning-depth option: when a model instance uses a GPT model ID, Options exposes an optional depth selector and every request through that resolved instance sends the selected OpenAI-compatible `reasoning_effort` value.
- Ship a `0.3.6` response-compatibility fix: valid textual replies must not be reported as empty when an OpenAI-compatible gateway returns Responses-style text deltas or a normal JSON completion to a request configured for streaming.
- Ship a `0.3.5` page-context fix: without an explicit selected region, every page operation uses the current page's generic readable content directly; it must not ask a model to choose a “main” region first, repeatedly suggest selecting a region, or downgrade a failed page question to ordinary chat.
- Ship a `0.3.4` screenshot-permission fix so the side panel can reliably call `chrome.tabs.captureVisibleTab` without depending on a temporary `activeTab` grant; the in-page “图” shortcut opens that protected extension surface instead of receiving screenshot pixels in page context.
- Ship a `0.3.3` dock-position fix: the in-page launcher remains attached to the right viewport edge across reloads, window resizing, display/DPI changes, and hide/show toggles, while vertical dragging remains configurable.
- Ship a `0.3.2` UI follow-up that promotes the existing selected-region clear action beside “选区域”, labels it unambiguously, and removes the page highlight through the existing `CLEAR_SELECTED_REGION` path.
- Ship a `0.3.1` regression fix for the user-observed chain on Bilibili dynamic pages: a freshly selected region must remain the authoritative page context for chat/read/save/summary, and inline translation must find usable blocks inside `div`-heavy selected regions instead of reporting that no正文 exists.
- Remove misleading success/fallback behavior: do not silently downgrade a selected-region question to ordinary chat, and do not render `(无内容)` as if an empty provider response were a valid answer; surface the actual failing stage with a retryable message.
- Release extension version `0.3.0` with multiple editable chat-model instances. Each instance owns its display name, provider preset, base URL, API key, model ID, and an explicit vision-capability flag.
- Allow add, edit, duplicate-as-new, delete, and choose-one-default model instance in Options. Preserve the legacy single-model configuration by migrating it into one instance.
- Add a native model `<select>` to the side panel. A new panel starts on the configured default, and every chat/page/writing request uses the currently selected instance.
- Disable and guard screenshot workflows when the selected instance has no vision capability. Explicit TTS configuration remains global; blank TTS URL/key fall back to the selected chat instance.
- Fix Bilibili/page extraction to address the verified top-frame routing defect, then add a bounded first-use page-planning pass: the selected model chooses from locally generated DOM candidates for each site/page-type/operation, the extension persists only the validated selector recipe, and later runs reuse or automatically refresh that recipe before producing output.
- Refresh the build/package and reload the already-installed unpacked extension in Chrome. Verify Options, side-panel selection, vision gating, legacy migration, Bilibili extraction, and package output without sending a paid/live model request.
- Report the shipped increments separately: shared schema and migration, Options UI, side-panel routing, page planning/extraction, and Chrome deployment.

### Non-goals

- Do not infer or expose hidden reasoning text, auto-select a depth, apply the option to non-GPT models, add provider-specific SDKs, or add a second request endpoint in `0.3.7`.
- Do not add provider-specific SDKs, automatic retries that could duplicate paid requests, tool-call execution, reasoning-text display, or a second API protocol/configuration surface in `0.3.6`.
- Do not delete the additive page-recipe storage/backup schema in `0.3.5`; existing recipe data remains backward compatible but is no longer consulted by normal page operations.
- No automatic/background/content-script screenshot capture, screen recording, new injection surface, or optional-permission flow in `0.3.4`; capture remains an explicit action inside the extension side panel. Host access is deliberately broadened to Chrome's required `<all_urls>` token so `captureVisibleTab` is consistently authorized.
- No free horizontal dock placement or left-edge docking in `0.3.3`; the existing hide/show control is right-edge-specific, so dragging adjusts only vertical position.
- Do not overload “清空” conversation history with page-context mutation; keep chat clearing and selected-region clearing as separate, explicit actions.
- No Bilibili private API scraping, automatic expansion of hidden feeds/danmaku, persisted page-text cache, or broad DOM rewrite. The fix stays ephemeral, top-frame scoped, and site-agnostic.
- No Chrome Web Store publication, remote repository push, new backend, account system, UI framework, SDK dependency, arbitrary model-generated code, or model-generated selector execution.
- No persistence of page text, DOM snapshots, credentials, or raw model-planner output in page recipes; store only origin, page type, operation, validated selectors, and timestamps.
- No per-message model provenance schema, automatic model routing, vision inference from model names, or remembered side-panel selection across panel recreation; each panel starts from the configured default.
- No changes to unrelated untracked screenshots, `.playwright-cli/`, `.playwright-mcp/`, `outputs/`, or `work/`.

### File Scope

- The `0.3.7` change is bounded to the existing model-instance schema/resolver, Chat Completions request builder, native Options form, focused tests, version metadata, and `CONTEXT.md`; side-panel/background callers continue consuming flat resolved settings without new routing code.
- The `0.3.6` fix is bounded to the shared response parser in `src/shared/apiClient.js`, focused tests in `test/apiClient.test.js`, version metadata, and `CONTEXT.md`; preserve all existing `0.3.5` changes and unrelated untracked artifacts.
- The `0.3.5` fix is bounded to the existing page-operation preparation and failure messages in `src/sidepanel/sidepanel.js`, one source-policy assertion in `scripts/check-extension.js`, version metadata, and `CONTEXT.md`; no DOM extraction rewrite, permission, storage migration, dependency, or external action is required.
- The `0.3.4` fix covers `manifest.json`, version metadata, the existing manifest validation script, the canonical privacy disclosure, `CONTEXT.md`, and the existing screenshot entry points in `src/content/contentScript.js` / `src/background.js`. The side panel remains the sole screenshot owner; no new module or dependency is added.
- The `0.3.3` fix is bounded to the existing dock interaction/state functions in `src/content/contentScript.js`, version metadata, and `CONTEXT.md`; no new storage key, permission, stylesheet, or dependency is required.
- The `0.3.2` follow-up is bounded to moving/renaming the existing `clearRegion` control in `src/sidepanel/sidepanel.html`, the smallest matching layout change in `src/sidepanel/sidepanel.css`, version metadata, and `CONTEXT.md`; no new handler or permission is required.
- Hotfix investigation and implementation are bounded to `src/sidepanel/sidepanel.js`, `src/content/contentScript.js`, the smallest existing shared helper if a test seam is required, focused tests, version metadata, and `CONTEXT.md`.
- Model instance contract, migration, resolution, duplication, and validation: new bounded shared helper plus `src/shared/defaults.js`, `src/shared/storage.js`, `src/shared/backup.js`, and focused tests.
- Options instance manager and global settings: `src/options/options.html`, `src/options/options.css`, `src/options/options.js`.
- Selected-instance request routing and vision gating: `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`, `src/sidepanel/sidepanel.js`, `src/background.js`, and TTS call resolution if required.
- Page candidate/recipe contract and persistence: one shared helper, `src/content/contentScript.js`, `src/sidepanel/sidepanel.js`, `src/shared/storage.js`, `src/shared/backup.js`, and focused tests.
- Version/release documentation only where existing checks require it: `manifest.json`, `package.json`, lockfile if present, and existing README/privacy/release files.
- Existing dirty changes in `src/shared/apiClient.js`, `src/shared/pageTypes.js`, `src/sidepanel/sidepanel.js`, `test/apiClient.test.js`, `test/pageTypes.test.js`, and `test/storage.test.js` are accepted prerequisites and must be preserved.

### Settled Contracts

- `reasoningEffort` belongs to each model instance. Allowed stored/sent values are `""`, `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`; empty means provider default and omits `reasoning_effort`. The control is visible only for GPT-5 reasoning-family model IDs after removing an optional provider prefix (for example `gpt-5.4` or `openai/gpt-5.4`), so unsupported GPT-4/audio/image models do not receive the field. Non-matching requests always omit it while preserving the stored selection for a later model switch; individual models may reject effort levels they do not support.
- `apiClient` continues receiving one flat resolved request-settings object. A shared model-instance resolver overlays the selected/default instance onto global settings, so callers do not duplicate configuration logic.
- Canonical settings add `modelInstances` and `defaultModelInstanceId`; compatibility fields `providerPreset`, `baseUrl`, `apiKey`, and `model` mirror the default instance for old data, floating-chat paths, and older backups.
- Duplicate creates a new UUID-backed instance with copied fields and a distinct `（副本）` name; it never writes to the clipboard. At least one instance always exists, and deleting the default selects another instance.
- Vision capability is explicit. Changing to a non-vision model clears a pending screenshot and disables screenshot controls; text-only operations remain available.
- Legacy flat settings migrate with vision enabled to preserve the extension's prior screenshot behavior; a newly added blank instance starts with vision disabled and requires explicit opt-in.
- First-use model selection is per panel session. Switching models mid-conversation is allowed and does not clear text history.
- Page recipes are keyed by origin, detected page type, and operation. The planner may return at most four candidate IDs generated by the extension; candidate IDs are mapped locally to selectors, validated against the current page candidate set, persisted, and retried once through generic extraction if stale or unavailable. Selector strings never enter the planner prompt.
- Page planning covers page-grounded chat, summary/analysis actions, inline page translation scope, reading/TTS, and saving a page snapshot. Explicit selected regions bypass planning and remain authoritative.
- `EXTRACT_PAGE` and `GET_CONTEXT_STATUS` target `frameId: 0`. Live Bilibili evidence shows readable top-frame body text and an injected content script, while the current unscoped tab message can accept an arbitrary all-frames response.
- Backups redact every model-instance API key and the TTS key unless the existing explicit include-keys option is enabled; merge imports preserve current secrets for matching instance IDs when imported secrets are redacted.

### Acceptance Commands and Evidence

- Focused tests prove per-instance normalization/duplication/resolution, provider-qualified GPT detection, invalid-value repair, and request-body behavior: selected GPT depths emit `reasoning_effort`; default/non-GPT requests omit it. The native Options form uses a hidden-by-default select that updates as the model ID changes. Run focused model/API/backup/storage tests, then `npm run verify` and `git diff --check`.
- Focused API-client tests reproduce and accept Chat Completions text plus Responses-style `response.output_text.delta` SSE and JSON completion bodies returned while streaming is enabled; a genuinely empty successful response still raises the explicit empty-content error. Run `node --test test/apiClient.test.js`, then `npm run verify` and `git diff --check`.
- Without a selected region, `preparePageForOperation` returns the generic current-page extraction directly and performs no planner/model request; with a selected region, the existing authoritative selected-region path remains unchanged. A page-extraction failure is not sent as ordinary chat and does not recommend region selection as the default remedy.
- The manifest check fails if the side panel reintroduces page-planner imports/calls or the ordinary-chat downgrade message.
- Manifest host access contains `<all_urls>` exactly once, and the manifest check fails if the permission is removed or visible-tab capture moves into background/page context. `captureVisibleTab` exists only in the side panel; the injected quick rail rejects synthetic clicks and routes “图” to the side panel without receiving or rendering screenshot data.
- Dock restore ignores legacy absolute `left`, clamps the saved `top`, clears any inline horizontal offset when visible, and persists only vertical position plus hidden state. Drag, resize, and hide/show paths all preserve right-edge anchoring.
- `clearRegion` appears exactly once in the side-panel HTML beside the primary page actions, remains disabled unless the current context is `selected-region`, and continues using the existing message path that removes `.custom-ai-assistant-selected-region`.
- Regression evidence must cover: selected-region snapshot fallback is scoped to the same tab+URL and cleared on region/page change; selected `div` roots yield bounded, non-duplicate translatable blocks; an empty provider response becomes an explicit error; ordinary page fallback behavior remains intact.
- Baseline `npm run verify` already passed on the inherited dirty worktree: 96/96 tests plus manifest check, import audit, build, package, and release audit.
- Focused pure-logic tests cover legacy migration, default repair, duplicate identity, selected/default resolution, per-instance key redaction/merge, page-recipe validation/keying, and stale-recipe fallback behavior where practical.
- Final `npm run verify` passes, followed by `git diff --check` and root inspection of the integrated diff and preserved untracked paths.
- A fresh `gpt-5.6-terra xhigh` reviewer reports no unresolved material correctness, security, migration, or UX finding.
- Chrome acceptance confirms the reloaded installed extension exposes model-instance management and model select, non-vision screenshot gating works, and a claimed Bilibili video page reports usable top-frame content. No live provider request is required.
- `releases/custom-ai-browser-assistant.zip` is rebuilt from the accepted source.

### Stop Conditions

- Stop and return to root if implementation needs a new permission, remote service, paid request, credential transmission, unapproved storage schema beyond the settled additive fields, arbitrary model-authored selectors/code, destructive action, or work outside file scope.
- Stop if a wave must overwrite another agent's files, modify preserved untracked artifacts, or cannot retain legacy flat settings/backups.
- Chrome Store publication, repository push, and any real provider request remain separate external actions.

## Pending List

- OpenViking continuity lookup is unavailable because the local service could not be reached; live repository and Chrome evidence are authoritative for this run.
- Prior Spark CLI routing in this checkout did not produce a valid `turn.completed`; implementation will use the available `gpt-5.6-terra` workers unless runtime evidence materially changes.
- Existing page recipes remain importable/exportable for backward compatibility but are intentionally inactive after `0.3.5`; remove the schema only in a separately approved migration.
- Deployment means build/package plus reload and local Chrome verification of the installed unpacked extension; it does not include Chrome Web Store publication or Git push.
- Chrome automation cannot open `chrome://extensions/` under its URL security policy, so the installed unpacked extension still needs the user to click its Reload button before final installed-UI acceptance. No alternate browser-control or CDP workaround is permitted.
- Page recipes use a non-atomic local read/modify/write cache. Concurrent panels can at worst lose one newly learned recipe and replan later; add cross-context serialization only if multi-window concurrency becomes common.
- `regionEventToken` is intentionally a small global counter. An extreme cross-tab event interleave can discard one otherwise valid selection event, but exact tab+URL and revision checks prevent cross-page reuse or writeback; revisit only if this is observed in multi-window use.

## Current State

- Branch: `codex/expert-user-improvements`, with the `0.3.1` hotfix based on committed release `b283a6a`; preserved unrelated untracked artifacts remain outside the hotfix.
- Active `0.3.7` design: reuse the existing per-instance normalization and flat request-settings resolution. Add one native Options select (`自动/关闭/极低/低/中/高/极高`), store `reasoningEffort` on the instance, and add `reasoning_effort` centrally in `buildChatRequest` only for recognized GPT-5 reasoning-family model IDs. Official Chat Completions documentation lists `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`, with model-specific availability; the local Sub2API bridge forwards this field. No live provider request is authorized.
- Done: `0.3.7` stores normalized per-instance reasoning depth, exposes it only for supported GPT-5 reasoning-family IDs (excluding audio/image variants), preserves it while hidden, and emits `reasoning_effort` only for valid nonempty GPT-5 requests. The supported set is `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`; individual model support remains provider-specific. Independent review's audio/image finding is resolved. Final `npm run verify` passed with 125/125 tests, manifest/import audits, build, package, and release audit; `git diff --check` passed and the rebuilt package is 65,717 bytes.
- Active `0.3.6` diagnosis: `streamChat` treats every successful response body as Chat Completions SSE and `readDeltaContent` only accepts `choices[0].delta.content`; therefore Responses-style `response.output_text.delta` events or a JSON body returned despite `stream: true` produce no tokens and trigger the observed empty-content error. Fix once in the shared parser without retrying the request.
- Done: `0.3.6` accepts Responses-style `response.output_text.delta` SSE events and extracts visible text from Responses or Chat Completions JSON returned to a streaming request, without displaying reasoning deltas or retrying the request. Final `npm run verify` passed with 121/121 tests, manifest/import audits, build, package, and release audit; the rebuilt package is 65,118 bytes.
- Confirmed `0.3.5` root cause from the current source and user report: every unselected page operation calls `resolvePageRecipe`, which makes an extra model request to choose “正文区域” before the real request. This contradicts the desired default that no selection means the current page and creates the repeated planning/selection guidance.
- Done: `0.3.5` removes the side-panel planner/recipe hop and selector plumbing. Unselected chat, summary, translation, save, and TTS now use the generic current-page extraction directly; selected regions remain authoritative.
- Done: a failed page read now stays a page-read error instead of sending the user's prompt as ordinary chat or recommending region selection as the default remedy. The manifest check blocks planner/selector plumbing and the old downgrade copy from returning.
- Done: final `npm run verify` passed with 116/116 tests, manifest/source-policy and import audits, build, package, and release audit; `git diff --check` passed with line-ending warnings only. The rebuilt `0.3.5` package is 64,924 bytes.
- Read-only Chrome diagnosis: Bilibili video top frame contains 2,236 readable characters, the extension dock is injected, and a Bilibili dynamic page contains 4,505 readable characters. The extraction defect is therefore not missing page content.
- Architecture approved after three independent read-only investigations: two pure shared helpers (`modelInstances.js`, `pageRecipes.js`), native Options controls, one flat request-settings resolver at call boundaries, top-frame page messages, and candidate-ID-only page planning. No dependency or permission change is required.
- Done: shared schema/migration/resolver, instance-aware backup, and bounded page-recipe persistence passed 19/19 focused tests.
- Done: native Options instance manager passed manifest/import checks; side-panel selected/default routing and explicit vision gates passed focused runtime checks.
- Done: Bilibili top-frame routing, bounded first-use Agent page planning, recipe reuse/fallback, translation/read/save coverage, and release metadata are integrated.
- Done: independent `gpt-5.6-terra xhigh` review found no unresolved P0-P3 finding; focused review checks passed 21/21 and the integrated suite passed 110/110.
- Done: `npm run verify` passed for `0.3.0`, including 110/110 tests, lint, import audit, build, package, and release audit; `git diff --check` passed with line-ending warnings only.
- Chrome evidence after the build: a fresh Bilibili video page has the extension dock injected and exposes readable video/comments DOM. Opening `chrome://extensions/` for the required Reload click was blocked by the browser-control URL policy.
- Done: the `0.3.1` hotfix keeps an exact tab+URL ephemeral selected-region snapshot, recovers an existing DOM marker, prevents selected-region questions from silently downgrading, invalidates stale same-page writes with a context revision, pins inline translation to its source tab/frame, adds a bounded `div` fallback, and reports empty/terminal SSE responses explicitly.
- Done: exact-region reselection is a no-op; a real region change or clear cancels active work, stops TTS, resets the conversation, and prevents stale translation writeback.
- Done: a fresh independent `gpt-5.6-terra xhigh` review reports no unresolved P0-P3 finding. Final `npm run verify` passed with 116/116 tests, manifest/lint and import audits, build, package, and release audit; `git diff --check` passed with line-ending warnings only.
- Done: non-mutating live Bilibili DOM acceptance recovered the selected marker with about 3,945 readable characters, found nine semantic translation blocks, and exercised one bounded `div` fallback block.
- Done: `0.3.2` moves the existing `clearRegion` control beside “选区域” as “清除选择”; it keeps the established disabled-state and `CLEAR_SELECTED_REGION` handler, while “清空” remains conversation-only. The narrow layout uses two primary-action columns to preserve chat height.
- Done: final `npm run verify` passed with 116/116 tests, manifest/lint and import audits, build, package, and release audit; `git diff --check` passed with line-ending warnings only.
- Confirmed `0.3.3` root cause from the supplied screenshot, source trace, and live DOM: the dock persisted an absolute horizontal coordinate globally. On a 2,560 CSS-pixel viewport, the hidden dock retained `visibleLeft: 1336`, so expanding it restored near the center instead of the right edge.
- Done: `0.3.3` removes persisted/free horizontal positioning, lets the existing CSS own the visible right inset, retains clamped vertical drag, and migrates legacy dock state by honoring `top` while ignoring `left`. Hide/show and resize persist only `{top, edgeHidden}`.
- Done: independent review caught and resolved a first-use safe-area regression; a second review reports no unresolved P0-P3 finding. Final `npm run verify` passed with 116/116 tests, manifest/lint and import audits, build, package, and release audit; `git diff --check` passed with line-ending warnings only.
- Confirmed `0.3.4` root cause: Chrome documents that `captureVisibleTab` requires `<all_urls>` or an active temporary `activeTab` grant. Side-panel and content-script button clicks are not among the gestures that grant `activeTab`, so the declared permission can exist while capture still fails with the observed error.
- Independent review found and blocked a first implementation where a synthetic click in shared page DOM could ask the background to capture another active tab and render the returned data URL back into the page. Resolved by deleting that content/background capture path, rejecting synthetic quick-rail clicks, and routing “图” to the side panel, which is now the sole screenshot owner.
- Done: a fresh independent security re-review reports no unresolved P0-P3 finding. Final `npm run verify` passed with 116/116 tests, manifest/security and import audits, build, package, and release audit; `git diff --check` passed with line-ending warnings only.
- Blocked only for installed-runtime acceptance: Chrome browser control cannot open `chrome://extensions/`, so the user must Reload the unpacked extension, confirm GPT-5 reasoning-depth visibility/save behavior, then recheck model replies, default current-page chat, and screenshot capture against `0.3.7`.

## Completion Gate

- Complete only after all deliverables map to integrated source, focused and full verification pass, independent review findings are resolved, the extension is reloaded in Chrome, the Bilibili path is rechecked, the package is rebuilt, and remaining risks are explicit.
