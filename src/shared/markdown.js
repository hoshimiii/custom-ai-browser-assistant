export function parseMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const fence = line.match(/^```\s*([^`]*)$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[1].trim(), text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }
    const list = line.match(/^(?:[-*+]\s+|\d+\.\s+)(.+)$/);
    if (list) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      const pattern = ordered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (index < lines.length && pattern.test(lines[index])) items.push(lines[index++].match(pattern)[1]);
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^```\s*/.test(lines[index]) && !/^(#{1,6})\s+/.test(lines[index]) && !/^>\s?/.test(lines[index]) && !/^(?:[-*+]\s+|\d+\.\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

function appendInline(parent, text) {
  for (const part of String(text).split(/(`[^`]*`)/g)) {
    if (part.startsWith("`") && part.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else parent.append(document.createTextNode(part));
  }
}

export function renderMarkdown(container, source) {
  container.textContent = "";
  for (const block of parseMarkdown(source)) {
    let node;
    if (block.type === "heading") {
      node = document.createElement(`h${block.level}`);
      appendInline(node, block.text);
    } else if (block.type === "quote") {
      node = document.createElement("blockquote");
      appendInline(node, block.text);
    } else if (block.type === "list") {
      node = document.createElement(block.ordered ? "ol" : "ul");
      for (const text of block.items) {
        const item = document.createElement("li");
        appendInline(item, text);
        node.append(item);
      }
    } else if (block.type === "code") {
      node = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-code";
      copy.textContent = "复制代码";
      copy.setAttribute("aria-label", "复制代码");
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(block.text);
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "复制失败";
        }
      });
      node.append(copy, code);
    } else {
      node = document.createElement("p");
      appendInline(node, block.text);
    }
    container.append(node);
  }
}
