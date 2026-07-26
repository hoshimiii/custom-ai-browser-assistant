# Project Context

## Current Brief

### Deliverables

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

- No Bilibili private API scraping, automatic expansion of hidden feeds/danmaku, persisted page-text cache, or broad DOM rewrite. The fix stays ephemeral, top-frame scoped, and site-agnostic.
- No Chrome Web Store publication, remote repository push, new backend, account system, UI framework, SDK dependency, arbitrary model-generated code, or model-generated selector execution.
- No persistence of page text, DOM snapshots, credentials, or raw model-planner output in page recipes; store only origin, page type, operation, validated selectors, and timestamps.
- No per-message model provenance schema, automatic model routing, vision inference from model names, or remembered side-panel selection across panel recreation; each panel starts from the configured default.
- No changes to unrelated untracked screenshots, `.playwright-cli/`, `.playwright-mcp/`, `outputs/`, or `work/`.

### File Scope

- Hotfix investigation and implementation are bounded to `src/sidepanel/sidepanel.js`, `src/content/contentScript.js`, the smallest existing shared helper if a test seam is required, focused tests, version metadata, and `CONTEXT.md`.
- Model instance contract, migration, resolution, duplication, and validation: new bounded shared helper plus `src/shared/defaults.js`, `src/shared/storage.js`, `src/shared/backup.js`, and focused tests.
- Options instance manager and global settings: `src/options/options.html`, `src/options/options.css`, `src/options/options.js`.
- Selected-instance request routing and vision gating: `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`, `src/sidepanel/sidepanel.js`, `src/background.js`, and TTS call resolution if required.
- Page candidate/recipe contract and persistence: one shared helper, `src/content/contentScript.js`, `src/sidepanel/sidepanel.js`, `src/shared/storage.js`, `src/shared/backup.js`, and focused tests.
- Version/release documentation only where existing checks require it: `manifest.json`, `package.json`, lockfile if present, and existing README/privacy/release files.
- Existing dirty changes in `src/shared/apiClient.js`, `src/shared/pageTypes.js`, `src/sidepanel/sidepanel.js`, `test/apiClient.test.js`, `test/pageTypes.test.js`, and `test/storage.test.js` are accepted prerequisites and must be preserved.

### Settled Contracts

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
- Agent page planning intentionally adds one extra text-model call only the first time a site/page-type/operation lacks a usable recipe; generic extraction remains the fallback.
- Deployment means build/package plus reload and local Chrome verification of the installed unpacked extension; it does not include Chrome Web Store publication or Git push.
- Chrome automation cannot open `chrome://extensions/` under its URL security policy, so the installed unpacked extension still needs the user to click its Reload button before final installed-UI acceptance. No alternate browser-control or CDP workaround is permitted.
- Page recipes use a non-atomic local read/modify/write cache. Concurrent panels can at worst lose one newly learned recipe and replan later; add cross-context serialization only if multi-window concurrency becomes common.
- `regionEventToken` is intentionally a small global counter. An extreme cross-tab event interleave can discard one otherwise valid selection event, but exact tab+URL and revision checks prevent cross-page reuse or writeback; revisit only if this is observed in multi-window use.

## Current State

- Branch: `codex/expert-user-improvements`, with the `0.3.1` hotfix based on committed release `b283a6a`; preserved unrelated untracked artifacts remain outside the hotfix.
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
- Blocked only for installed-runtime acceptance: Chrome browser control cannot open `chrome://extensions/`, so the user must click Reload for the unpacked extension before the exact Bilibili flow can be rechecked against `0.3.1`.

## Completion Gate

- Complete only after all deliverables map to integrated source, focused and full verification pass, independent review findings are resolved, the extension is reloaded in Chrome, the Bilibili path is rechecked, the package is rebuilt, and remaining risks are explicit.
