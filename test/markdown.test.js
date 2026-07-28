import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../src/shared/markdown.js";

test("fenced code keeps its exact literal text", () => {
  assert.deepEqual(parseMarkdown("```js\nconst value = '<tag>';\n```"), [{ type: "code", language: "js", text: "const value = '<tag>';" }]);
});

test("HTML-like text remains literal markdown text", () => {
  const blocks = parseMarkdown("# <img src=x>\n\nHello <script>alert(1)</script> and `x < y`");
  assert.equal(blocks[0].text, "<img src=x>");
  assert.equal(blocks[1].text, "Hello <script>alert(1)</script> and `x < y`");
});
