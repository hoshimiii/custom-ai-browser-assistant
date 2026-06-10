import test from "node:test";
import assert from "node:assert/strict";
import { findPageAction, findSelectionAction, findWritingAction, PAGE_ACTIONS, SELECTION_ACTIONS, WRITING_ACTIONS } from "../src/shared/actions.js";

test("action registries expose Monica-like workflows", () => {
  assert.ok(PAGE_ACTIONS.length >= 4);
  assert.ok(SELECTION_ACTIONS.some((action) => action.id === "translate"));
  assert.ok(WRITING_ACTIONS.some((action) => action.id === "polish"));
});

test("find action helpers fall back to defaults", () => {
  assert.equal(findPageAction("missing").id, PAGE_ACTIONS[0].id);
  assert.equal(findSelectionAction("missing").id, SELECTION_ACTIONS[0].id);
  assert.equal(findWritingAction("missing").id, WRITING_ACTIONS[0].id);
});
