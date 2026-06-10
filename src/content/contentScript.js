(() => {
  const TOOLBAR_ID = "custom-ai-assistant-selection-toolbar";
  const SEARCH_PANEL_ID = "custom-ai-assistant-search-panel";
  let lastSelection = "";

  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keyup", handleSelection);
  document.addEventListener("scroll", hideToolbar, { passive: true });
  document.addEventListener("focusin", markEditable, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_PAGE") {
      sendResponse({ ok: true, page: extractPage() });
      return true;
    }
    if (message?.type === "GET_ACTIVE_EDITABLE") {
      sendResponse({ ok: true, editable: getActiveEditableSnapshot() });
      return true;
    }
    if (message?.type === "REPLACE_ACTIVE_EDITABLE") {
      replaceActiveEditable(message.text || "");
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  maybeInjectSearchPanel();

  function extractPage() {
    const type = detectPageType(location.href, document.contentType);
    if (type === "youtube") {
      return extractYouTubePage();
    }
    return {
      type,
      title: document.title,
      url: location.href,
      text: collectReadableText()
    };
  }

  function detectPageType(url, mimeType = "") {
    if (String(mimeType || "").toLowerCase().includes("pdf")) return "pdf";
    try {
      const current = new URL(url);
      const host = current.hostname.toLowerCase();
      const path = current.pathname.toLowerCase();
      if ((host.includes("youtube.com") && path === "/watch") || host === "youtu.be") return "youtube";
      if (path.endsWith(".pdf")) return "pdf";
    } catch {
      return "webpage";
    }
    return "webpage";
  }

  function extractYouTubePage() {
    return {
      type: "youtube",
      title: readText("h1.ytd-watch-metadata, h1.title, meta[property='og:title']", "content") || document.title,
      url: location.href,
      author: readText("#owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint"),
      description: readYouTubeDescription(),
      transcript: readYouTubeTranscript(),
      text: collectReadableText()
    };
  }

  function readText(selector, attribute = "") {
    const node = document.querySelector(selector);
    if (!node) return "";
    if (attribute) return node.getAttribute(attribute) || "";
    return node.innerText?.trim() || node.textContent?.trim() || "";
  }

  function readYouTubeDescription() {
    const selectors = [
      "ytd-text-inline-expander",
      "#description-inline-expander",
      "#description",
      "meta[name='description']"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const text = selector.startsWith("meta") ? node.getAttribute("content") : node.innerText || node.textContent;
      if (text?.trim()) return text.trim();
    }
    return "";
  }

  function readYouTubeTranscript() {
    const selectors = [
      "ytd-transcript-segment-renderer",
      "yt-formatted-string.segment-text",
      ".ytd-transcript-segment-renderer"
    ];
    const segments = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = node.innerText || node.textContent || "";
        if (text.trim()) segments.push(text.trim());
      }
      if (segments.length) break;
    }
    return [...new Set(segments)].join("\n");
  }

  function collectReadableText() {
    const candidates = [
      "article",
      "main",
      "[role='main']",
      ".content",
      "#content"
    ];
    const node = candidates.map((selector) => document.querySelector(selector)).find(Boolean) || document.body;
    return node.innerText || document.body.innerText || "";
  }

  function handleSelection() {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || "";
    if (!text || text.length < 2) {
      hideToolbar();
      return;
    }
    lastSelection = text;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    showToolbar(rect);
  }

  function showToolbar(rect) {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = TOOLBAR_ID;
      toolbar.innerHTML = `
        <button data-action="explain">解释</button>
        <button data-action="translate">翻译</button>
        <button data-action="summarize">总结</button>
        <button data-action="rewrite">改写</button>
        <button data-action="continue">续写</button>
      `;
      toolbar.addEventListener("mousedown", (event) => event.preventDefault());
      toolbar.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        chrome.runtime.sendMessage({
          type: "RUN_SELECTION_ACTION",
          action: button.dataset.action,
          selectionText: lastSelection
        });
        hideToolbar();
      });
      document.documentElement.appendChild(toolbar);
    }
    toolbar.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    toolbar.style.top = `${Math.max(8, rect.top + window.scrollY - 42)}px`;
    toolbar.hidden = false;
  }

  function hideToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) toolbar.hidden = true;
  }

  function maybeInjectSearchPanel() {
    const query = extractSearchQuery(location.href);
    if (!query) return;
    if (document.getElementById(SEARCH_PANEL_ID)) return;
    const panel = document.createElement("aside");
    panel.id = SEARCH_PANEL_ID;
    panel.innerHTML = `
      <div class="caa-search-title">AI Assistant</div>
      <div class="caa-search-query"></div>
      <button type="button">Ask AI</button>
    `;
    panel.querySelector(".caa-search-query").textContent = query;
    panel.querySelector("button").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "RUN_SEARCH_ACTION", query });
    });
    const target = document.querySelector("main") || document.body;
    target.prepend(panel);
  }

  function extractSearchQuery(url) {
    try {
      const current = new URL(url);
      const host = current.hostname.toLowerCase();
      if (host.includes("google.") || host.includes("bing.")) {
        return current.searchParams.get("q") || "";
      }
    } catch {
      return "";
    }
    return "";
  }

  function markEditable(event) {
    const target = event.target;
    if (isEditable(target)) {
      target.dataset.customAiAssistantEditable = "active";
    }
  }

  function getActiveEditableSnapshot() {
    const target = document.activeElement;
    if (!isEditable(target)) return null;
    return {
      text: readEditable(target),
      tagName: target.tagName,
      contentEditable: target.isContentEditable
    };
  }

  function replaceActiveEditable(text) {
    const target = document.activeElement;
    if (!isEditable(target)) return;
    if (target.isContentEditable) {
      target.textContent = text;
    } else {
      target.value = text;
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function isEditable(node) {
    if (!node) return false;
    const tag = node.tagName?.toLowerCase();
    return node.isContentEditable || tag === "textarea" || (tag === "input" && ["text", "search", "email", "url", ""].includes(node.type));
  }

  function readEditable(node) {
    return node.isContentEditable ? node.innerText || node.textContent || "" : node.value || "";
  }
})();
