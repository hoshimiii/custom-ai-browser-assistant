# Project Context

## Current Brief

This turn's only goal: retain the completed local `0.3.8` release evidence and its one bounded browser-runtime follow-up.

### Deliverables

- Retain the independent Terra usability/packaging report for commit `097ffab` on `codex/decoupled-page-context`.
- Retain fresh root verification and the packaged `0.3.8` ZIP evidence.
- Local `master` fast-forwarded from `cd89b3e` to `eb47ac8`, then rebuilt `releases/custom-ai-browser-assistant.zip` from `master`.

### Non-goals

- No source feature change unless a test finds a material defect; any such repair returns to the feature branch before merging.
- No provider request, GitHub push/release, Chrome Web Store publication, permission/storage-schema change, or change to unrelated untracked artifacts.
- “Release” means the local, versioned ZIP only.

### File Scope

- The committed `0.3.8` diff, its tests, local Git refs, `releases/custom-ai-browser-assistant.zip`, and this context file.
- Source files remain read-only unless an accepted test finding requires a scoped return to the feature branch.

### Settled Decisions

- Merge is permitted only as a local fast-forward from `codex/decoupled-page-context` into `master`; do not alter the preserved untracked files.
- Chrome runtime testing may reload the local unpacked extension, but must not access credentials, send a provider request, or publish externally.

### Acceptance Commands

- Independent Terra report: `PASS_WITH_BROWSER_BLOCKER`; no P0-P3 findings, 4 focused tests and the 127-test package suite passed, and packaged source hashes matched the worktree.
- `node --test test/markdown.test.js test/prompts.test.js`
- `npm run verify`, `git diff --check`, and ZIP manifest inspection before and after the local merge.
- `git merge --ff-only codex/decoupled-page-context` completed while on local `master`.

### Verification and Remaining Risk

- Root evidence before and after merge: focused tests 4/4, `npm run verify` 127/127 plus lint/import/build/package/release audit, and `git diff --check` passed; the rebuilt ZIP is version `0.3.8`, 67,685 bytes, and includes all required side-panel and Markdown sources.
- The independent test could discover the installed extension settings tab, but the Chrome control policy blocked opening `chrome-extension://` pages. Browser side-panel and clipboard runtime remain unverified; no credentials or provider requests were used.

### Stop Conditions

- Stop before any future external publication or remote push; neither was part of this release.
- Stop before external publication or remote push; neither is authorized.
- Preserve `.playwright-cli/`, `.playwright-mcp/`, `outputs/`, `work/`, and the existing preview PNG files.

## Pending List

- Browser side-panel rendering and Clipboard API behavior still need one user-operated unpacked-extension reload because policy blocked `chrome-extension://` inspection; do not treat that runtime slice as passed.
