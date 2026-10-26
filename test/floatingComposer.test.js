import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("only composer HTML is page-accessible and its packaged scripts/styles stay local", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ["src/content/floatingComposer.html"], matches: ["http://*/*", "https://*/*"]
  }]);
  const markup = fs.readFileSync(new URL("../src/content/floatingComposer.html", import.meta.url), "utf8");
  assert.match(markup, /<script src="floatingComposer\.js" defer><\/script>/);
  assert.match(markup, /<link rel="stylesheet" href="content\.css">/);
  assert.doesNotMatch(markup, /\son\w+=|https?:/i);
  for (const script of markup.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) assert.equal(script[1].trim(), "");
  for (const file of ["floatingComposer.js", "content.css"]) assert.ok(fs.existsSync(new URL(`../src/content/${file}`, import.meta.url)));
});

// Simulated event trust exercises branches; the retained browser harness checks real browser provenance.
function fixture() {
  const messages = [];
  function element() {
    const listeners = new Map();
    return {
      value: "", disabled: false, focused: false,
      addEventListener(type, handler) { listeners.set(type, handler); },
      focus() { this.focused = true; },
      fire(type, properties = {}) {
        const event = { isTrusted: false, preventDefault() { this.prevented = true; }, ...properties };
        listeners.get(type)?.(event);
        return event;
      }
    };
  }
  const input = element(), button = element(), form = element(), window = element();
  const parent = { postMessage(message) { messages.push(message); } };
  vm.runInNewContext(fs.readFileSync(new URL("../src/content/floatingComposer.js", import.meta.url), "utf8"), {
    document: { querySelector(selector) { return { textarea: input, button, form }[selector]; } },
    window, parent
  });
  return { input, button, form, window, parent, messages, sends: () => messages.filter((item) => item.type === "CAA_FLOATING_COMPOSER_SEND") };
}

test("composer ignores synthetic keyboard, button, submit and parent prompt injection", () => {
  const f = fixture();
  f.input.value = "page supplied prompt";
  f.input.fire("keydown", { key: "Enter" });
  f.button.fire("click");
  assert.equal(f.form.fire("submit", { isTrusted: true }).prevented, true);
  f.window.fire("message", { isTrusted: true, source: f.parent, data: { type: "CAA_FLOATING_COMPOSER_SEND", prompt: "injected" } });
  assert.deepEqual(f.sends(), []);
  assert.equal(f.input.value, "page supplied prompt");
});

test("trusted Enter and button preserve reset, busy gating and focus", () => {
  const f = fixture();
  f.input.value = " user question ";
  f.input.fire("keydown", { isTrusted: true, key: "Enter" });
  assert.equal(f.sends()[0].prompt, "user question");
  assert.equal(f.input.value, "");
  assert.equal(f.input.disabled, true);
  f.input.value = "second";
  f.button.fire("click", { isTrusted: true });
  assert.equal(f.sends().length, 1);
  f.window.fire("message", { isTrusted: true, source: {}, data: { type: "CAA_FLOATING_COMPOSER_BUSY", busy: false } });
  assert.equal(f.input.disabled, true);
  f.window.fire("message", { isTrusted: true, source: f.parent, data: { type: "CAA_FLOATING_COMPOSER_BUSY", busy: false } });
  assert.equal(f.input.disabled, false);
  assert.equal(f.input.focused, true);
  f.button.fire("click", { isTrusted: true });
  assert.equal(f.sends()[1].prompt, "second");
});

test("Shift+Enter, active IME, isComposing and legacy keyCode 229 do not send", () => {
  const f = fixture();
  f.input.value = "draft";
  for (const properties of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    assert.equal(f.input.fire("keydown", { isTrusted: true, key: "Enter", ...properties }).prevented, undefined);
  }
  f.input.fire("compositionstart", { isTrusted: true });
  f.input.fire("keydown", { isTrusted: true, key: "Enter" });
  assert.equal(f.sends().length, 0);
  f.input.fire("compositionend", { isTrusted: true });
  f.input.fire("keydown", { isTrusted: true, key: "Enter" });
  assert.equal(f.sends().length, 1);
});
