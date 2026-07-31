# Project Context

## Current Brief

This turn's only goal: add explicit page-code context, confirmed foreground page operations, confirmed persistent background page tasks, and IME-safe Enter-to-send behavior.

### Deliverables

- Add side-panel tags for `网页代码` and `允许页面操作` beside the existing current-page tag.
- `网页代码` reads a bounded, sanitized snapshot of the selected DOM subtree, or the whole current document when no region is selected.
- `允许页面操作` lets the configured model propose a validated structured action plan; no model-authored JavaScript string is evaluated.
- A foreground plan is pinned to its original tab/document, shown to the user, and runs only after an explicit click.
- A background plan requires a second confirmation before creation, has `document` or `tab` scope, remains bound to the original tab, and always exposes a manual stop control.
- Background `tab` tasks may resume only after same-origin reload/navigation in the current browser session; cross-origin navigation pauses them. Background tasks do not survive a browser restart.
- Switching the active tab never silently retargets or terminates a pinned task. Closing the target tab stops its tasks.
- The toolbar badge shows the number of active/paused background tasks; the side panel shows target, state, last run/error, and a stop button.
- Side-panel and floating-chat textareas send on Enter, insert a newline on Shift+Enter, and never send the Enter used to confirm a Chinese/Japanese/Korean IME composition.
- Existing model configuration, page extraction, selected-region precedence, conversation history, floating sessions, video summaries, and timestamp links remain compatible.
- Work is isolated on branch `codex/page-code-script-tasks`.

### Non-goals

- No `eval`, `new Function`, model-authored arbitrary JavaScript, `chrome.debugger`, DevTools integration, remote code, page MAIN-world access, browser/system command execution, or arbitrary network requests.
- No access to cookies, password/file inputs, extension pages, `chrome://` pages, browser credentials, or cross-origin frame contents.
- No persistent service, native host, new dependency, storage migration, or browser-restart task recovery.
- No automatic form submission, password entry, script/style HTML injection, event-handler attributes, `javascript:` URLs, or unconfirmed execution.
- No Chrome overwrite or live paid-provider call without a separate request.

### File and Contract Scope

- Shared plan contract/parser: a small new module under `src/shared/` plus focused Node tests.
- Side-panel UI/orchestration: `src/sidepanel/sidepanel.html`, `.css`, and `.js`.
- Page snapshot and fixed executor: `src/content/contentScript.js` and focused static/runtime checks.
- Background task session state and badge: `src/background.js`; use `chrome.storage.session`, not `local`.
- Manifest changes only if an existing permission cannot satisfy the approved behavior.
- Documentation/check scripts only where needed to describe and guard the shipped contract.
- Preserve all unrelated untracked `.playwright-*`, screenshots, `outputs/`, and `work/` artifacts.

### Settled Architecture and Contracts

- A task target is pinned before the model request to the captured top-frame `tabId`, URL, origin, and a content-script document token. Active-tab changes do not alter the target.
- Page-code snapshots are bounded to 24,000 characters, remove extension-owned UI, scrub form values and sensitive attributes, omit inline script/style bodies, and retain structural HTML plus safe metadata.
- The model returns one bounded JSON plan with an explanation, mode (`immediate` or `background`), background scope (`document` or `tab`), bounded interval, and at most 12 fixed actions.
- The fixed action set is deliberately small: query/inspect, click, set a non-sensitive input value, set text, set safe attributes, set bounded inline style properties, remove an element, and scroll.
- Runtime validation is repeated inside the content-script trust boundary. Selectors, text, attributes, style names/values, action counts, and result sizes are bounded.
- URLs included in model prompts strip credentials, query strings, and fragments; local target pinning retains the exact URL separately. Contenteditable drafts are blanked from DOM snapshots.
- Background plans reject every `click` and `setValue` action because page activation and input/change handlers can navigate or submit forms. Confirmed foreground plans retain both actions.
- Foreground plans run once after the user clicks the plan's execute button. A navigation/document-token change aborts the run.
- Background plans first appear as model proposals. Clicking create opens a modal showing target, scope, interval, actions, effects, and stop behavior. Only `确认并启动后台任务` creates the task.
- Background execution uses a content-script timer and a fixed packaged executor. Before every timer tick, the content script asks the background to validate the current task ID, nonce, tab, origin, and document token; a stale/BFCache document cannot keep executing after stop or navigation.
- Task metadata lives only in background-owned `chrome.storage.session`; content scripts never read it directly. Service-worker suspension is harmless and browser restart clears tasks.
- `document` tasks are valid only for their original document token. `tab` tasks can be offered to a new content-script document only when the tab ID and origin still match. Cross-origin navigation sets the task to `paused`.
- Foreground preview/execution and background creation require the captured URL and document token to match exactly. Any URL change expires document-scoped work; same-origin URL rebinding remains exclusive to `tab` tasks.
- The fixed executor rejects `html`, `body`, extension-owned nodes, and ancestor targets containing extension-owned UI.
- Manual stop is idempotent and removes the session task before telling the content script to stop. The next tick validation therefore fails even when STOP delivery misses a stale document. Stopping prevents future runs; it does not promise to undo prior DOM changes.
- Disabling `允许页面操作` while background tasks exist must prompt whether to stop them; it must not silently leave them running.
- IME handling uses `compositionstart`, `compositionend`, `event.isComposing`, and the `keyCode === 229` fallback on `keydown`. Enter sends only when not composing; Shift+Enter always remains a newline.

### Acceptance Commands and Evidence

- Focused Node tests cover plan parsing/normalization, action and selector/value bounds, unsafe attribute/style rejection, task normalization, origin/document scope matching, and idempotent stop behavior where practical.
- Static checks prove the content executor does not use dynamic evaluation and that both chat inputs include IME-safe Enter handling.
- `npm run verify`
- `git diff --check`
- Root manual diff review covers target pinning, stale-document behavior, cross-origin pause, confirmation ordering, session-only storage, badge/stop lifecycle, DOM-write boundaries, prompt-injection handling, history compatibility, and unrelated files.

### Implementation and Verification Status

- Pure plan parsing, task normalization/lifecycle classification, bounded prompt builders, fixed DOM snapshot/executor, background session task owner, side-panel tags/confirmations/task controls, and both IME-safe input paths are implemented.
- Versions are aligned at `0.5.0`; manifest permissions and host permissions are unchanged.
- Final integrated checks pass: 158/158 Node tests, extension static audit, import audit, build, package audit, release audit, syntax checks, and `git diff --check`.
- Two Terra xhigh review passes found and verified fixes for prompt leakage, background click/setValue side effects, exact URL pinning, extension-UI ancestor writes, and unsafe `data-state` snapshot metadata. The correction verification review returned `PASS`.
- Live installed-Chrome behavior remains unverified and must be reported separately from local/static acceptance.

### Stop Conditions

- Stop and return to root if the implementation requires arbitrary JavaScript evaluation, `chrome.debugger`, remote code, a new host permission, a storage migration, or a browser/native background service.
- Stop if a safe plan cannot express the requested capability without a new product/contract decision.
- Stop before Chrome installation, live provider use, or destructive cleanup.
- Any implementer must stop if its assigned file scope overlaps another active writer or must expand beyond the approved interface.

## Pending List

- Existing manifest permissions are sufficient; no permission or host-permission expansion was made.
- Live Chrome behavior, IME behavior, content-script reinjection, toolbar badge updates, and same-origin resume cannot be proven by Node/static tests alone.
- Background automatic clicks and input writes are intentionally excluded; add them only with a stronger trusted event/side-effect policy.
- Current OpenViking project/notes searches returned no relevant prior record; live repository evidence is authoritative.
- Whether browser-restart recovery should ever be added is intentionally deferred.
- Arbitrary JavaScript developer mode is intentionally deferred and would require a separate security/product decision.

## Exact Next Action

- Publish the verified `v0.5.0` branch/merge/ZIP release authorized by the user; installed-Chrome validation remains a separate action.
