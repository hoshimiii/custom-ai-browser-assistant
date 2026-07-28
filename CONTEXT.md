# Project Context

## Current Brief

This turn's only goal: make every in-page selection-toolbar action run inside the existing draggable floating chat, keep multi-turn interaction there, and surface persisted floating sessions in the side-panel history.

### Deliverables

- `解释`、`翻译`、`总结`、`改写`、`续写` open a selection-bound draggable floating chat and automatically run the selected action as its first turn.
- `对话` continues to open an empty selection-bound floating chat; later prompts remain multi-turn within that session.
- The first action result and every follow-up remain persisted through the existing `floatingSessions` storage contract.
- Side-panel `历史` combines ordinary conversations and floating sessions, marks floating entries clearly, sorts by latest update, and lets the user inspect a floating transcript.
- Bump the local extension/package version to `0.3.9` and rebuild the ZIP after verification.

### Non-goals

- Do not replace `floatingSessions`, duplicate each turn into ordinary `history`, add a new storage schema, or migrate existing records.
- Do not change right-click context-menu routing, page actions, model/provider settings, permissions, or the existing five-minute floating-memory compression behavior.
- Do not push, merge, publish a GitHub Release, call a live provider, or modify unrelated untracked artifacts without a separate request.

### File Scope

- Bounded implementation areas: selection-toolbar and floating-dialog flow in `src/content/contentScript.js`; floating request dispatch in `src/background.js`; history rendering/storage imports in `src/sidepanel/sidepanel.js` and `src/shared/storage.js` only if needed; existing shared action/prompt/floating-memory helpers; focused tests; version metadata; this file.
- CSS/HTML may change only if the existing history controls cannot present the new entry type accessibly.
- Preserve `.playwright-cli/`, `.playwright-mcp/`, `outputs/`, `work/`, and the existing preview PNG files.

### Settled Decisions

- Reuse the existing draggable floating-chat UI and `FLOATING_CHAT_START` / `FLOATING_CHAT_MESSAGE` pipeline; do not create a second popup implementation.
- An action button creates one new floating session, displays a concise action label as the first user turn, and lets the background build the action-specific model prompt from the stored selection plus current settings.
- Floating sessions remain canonical in `floatingSessions`; the side-panel history is a combined view rather than duplicated persistence.
- Clicking a floating history entry opens a read-only native side-panel dialog with its source, optional compressed-memory label, and messages; it never changes the active side-panel conversation or enables side-panel continuation.
- `清空记录` clears both ordinary and floating conversation stores after the existing two-step confirmation.
- Right-click context-menu actions remain side-panel actions; only the in-page selection toolbar changes.

### Acceptance Commands

- Focused tests must cover action-specific initial prompts, floating-session persistence, combined history ordering/type distinction, and clearing all visible history records.
- `node --test test/floatingMemory.test.js test/prompts.test.js test/storage.test.js`
- `npm run verify`
- `git diff --check`
- Inspect the rebuilt ZIP manifest and verify its relevant source hashes match the worktree.

### Verification and Remaining Risk

- Experienced-user review approved the existing floating-chat reuse and a read-only native dialog for side-panel floating-history inspection.
- The requested Spark CLI worker exited successfully but did not receive its task contract and returned `NEEDS_CONTEXT`; implementation was routed to bounded `gpt-5.6-terra medium` agents instead.
- Independent review found synthetic-click request risk, failed-request persistence loss, incomplete transcript labeling, and stale packaging. The correction batch resolved the code findings; re-review returned `PASS` with no remaining P0-P3.
- Focused checks passed 16/16. Final `npm run verify` passed 131/131 tests plus lint, import audit, build, package, and release audit; `git diff --check` passed.
- The rebuilt ZIP is version `0.3.9`, 69,267 bytes, SHA-256 `3735cb7aa64f94f76fb5cd7e55bcbbc862e948c09dfa034961868e8c9f85cae2`; seven changed runtime source entries match the worktree byte-for-byte.
- Browser-runtime behavior remains unverified until the unpacked extension is reloaded manually; no provider request or credential inspection was performed.

### Exact Next Action

- Reload the existing unpacked extension without removing it, then verify one selection action, one follow-up turn, the side-panel read-only floating-history dialog, and the two-step combined history clear.

### Stop Conditions

- Stop if the change requires a new permission, storage migration, provider call, or a second floating-window implementation.
- Stop if side-panel continuation of a floating session would require duplicating or silently diverging its canonical record; transcript inspection is sufficient for this request.
- Stop before any external push, merge, or release.

## Pending List

- Browser runtime acceptance still requires a user-operated unpacked-extension reload because Chrome automation cannot open `chrome://extensions/` or extension pages.
