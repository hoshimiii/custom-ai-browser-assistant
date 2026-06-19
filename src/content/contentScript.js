(() => {
  const TOOLBAR_ID = "custom-ai-assistant-selection-toolbar";
  const SEARCH_PANEL_ID = "custom-ai-assistant-search-panel";
  const LAUNCHER_ID = "custom-ai-assistant-launcher";
  const TRANSLATABLE_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dd,dt,summary";
  const CONTAINER_SELECTOR = "article,main,[role='main'],section,div";
  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "code",
    "pre",
    "textarea",
    "input",
    "select",
    "button",
    "nav",
    "header",
    "footer",
    "[aria-hidden='true']",
    "[hidden]",
    "[contenteditable='true']",
    `#${TOOLBAR_ID}`,
    `#${SEARCH_PANEL_ID}`,
    `#${LAUNCHER_ID}`,
    ".custom-ai-assistant-inline-translation"
  ].join(",");

  let lastSelection = "";
  let lastSelectionRange = null;
  let selectedRegion = null;
  let pickMode = false;
  let highlightedPickNode = null;

  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keyup", handleSelection);
  document.addEventListener("scroll", hideToolbar, { passive: true });
  document.addEventListener("focusin", markEditable, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_PAGE") {
      sendResponse({ ok: true, page: extractPage() });
      return true;
    }
    if (message?.type === "GET_CONTEXT_STATUS") {
      sendResponse({ ok: true, context: buildContextStatus() });
      return true;
    }
    if (message?.type === "START_ELEMENT_PICK") {
      startElementPicker();
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "CLEAR_SELECTED_REGION") {
      clearSelectedRegion();
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "GET_TRANSLATABLE_BLOCKS") {
      sendResponse({ ok: true, blocks: collectTranslatableBlocks(message.limit || 48), context: buildContextStatus() });
      return true;
    }
    if (message?.type === "APPLY_TRANSLATIONS") {
      applyTranslations(message.translations || []);
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "APPLY_SELECTION_TRANSLATION") {
      applySelectionTranslation(message.translation || "");
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "TOGGLE_TRANSLATIONS") {
      setTranslationsHidden(Boolean(message.hidden));
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "CLEAR_TRANSLATIONS") {
      clearTranslations();
      sendResponse({ ok: true });
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
  injectFloatingLauncher();

  function extractPage() {
    const type = detectPageType(location.href, document.contentType);
    const region = getSelectedRegionSnapshot();
    if (region?.text) {
      return {
        type,
        scope: "selected-region",
        title: `${region.label} - ${document.title}`,
        url: location.href,
        text: region.text,
        selectedRegion: region
      };
    }
    if (type === "youtube") {
      return { ...extractYouTubePage(), scope: "page" };
    }
    return {
      type,
      scope: "page",
      title: document.title,
      url: location.href,
      text: collectReadableText()
    };
  }

  function buildContextStatus() {
    const region = getSelectedRegionSnapshot();
    if (region?.text) {
      return {
        mode: "selected-region",
        label: region.label,
        chars: region.text.length,
        url: location.href,
        title: document.title
      };
    }
    const text = collectReadableText();
    return {
      mode: text ? "page" : "unavailable",
      label: text ? "当前网页" : "未读取网页",
      chars: text.length,
      url: location.href,
      title: document.title,
      pageType: detectPageType(location.href, document.contentType)
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
    const root = getContextRoot() || getReadableRoot();
    return root?.innerText || document.body?.innerText || "";
  }

  function getReadableRoot() {
    const candidates = [
      "article",
      "main",
      "[role='main']",
      ".content",
      "#content"
    ];
    return candidates.map((selector) => document.querySelector(selector)).find(Boolean) || document.body;
  }

  function handleSelection() {
    if (pickMode) return;
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || "";
    if (!text || text.length < 2 || !selection.rangeCount) {
      hideToolbar();
      return;
    }
    lastSelection = text;
    lastSelectionRange = selection.getRangeAt(0).cloneRange();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
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

  function injectFloatingLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return;
    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open AI Assistant");
    launcher.title = "Open AI Assistant";
    launcher.innerHTML = `
      <span class="caa-launcher-mark" aria-hidden="true">AI</span>
      <span class="caa-launcher-dot" aria-hidden="true"></span>
    `;
    launcher.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    document.documentElement.appendChild(launcher);
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

  function startElementPicker() {
    if (pickMode) return;
    pickMode = true;
    hideToolbar();
    document.documentElement.classList.add("custom-ai-assistant-picking");
    document.addEventListener("mousemove", handlePickerMove, true);
    document.addEventListener("click", handlePickerClick, true);
    document.addEventListener("keydown", handlePickerKeydown, true);
    chrome.runtime.sendMessage({ type: "REGION_PICK_STARTED" });
  }

  function stopElementPicker() {
    pickMode = false;
    clearPickerHighlight();
    document.documentElement.classList.remove("custom-ai-assistant-picking");
    document.removeEventListener("mousemove", handlePickerMove, true);
    document.removeEventListener("click", handlePickerClick, true);
    document.removeEventListener("keydown", handlePickerKeydown, true);
  }

  function handlePickerMove(event) {
    const node = findPickTarget(event.target);
    if (node === highlightedPickNode) return;
    clearPickerHighlight();
    highlightedPickNode = node;
    highlightedPickNode?.classList.add("custom-ai-assistant-pick-hover");
  }

  function handlePickerClick(event) {
    const node = findPickTarget(event.target);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    selectRegion(node);
    stopElementPicker();
  }

  function handlePickerKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopElementPicker();
      chrome.runtime.sendMessage({ type: "REGION_PICK_CANCELLED" });
    }
  }

  function findPickTarget(target) {
    const start = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!start || isExtensionNode(start) || start.closest(SKIP_SELECTOR)) return null;
    let node = start.closest(`${TRANSLATABLE_SELECTOR},${CONTAINER_SELECTOR}`) || start;
    while (node && node !== document.body && normalizeText(node.innerText).length < 40) {
      node = node.parentElement;
    }
    if (!node || isExtensionNode(node) || node.matches("html")) return null;
    return node === document.body ? getReadableRoot() : node;
  }

  function selectRegion(node) {
    clearSelectedRegion();
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text) return;
    const id = ensureElementId(node);
    node.classList.add("custom-ai-assistant-selected-region");
    selectedRegion = {
      id,
      element: node,
      label: buildElementLabel(node),
      text
    };
    chrome.runtime.sendMessage({ type: "REGION_SELECTED", region: getSelectedRegionSnapshot() });
  }

  function clearSelectedRegion() {
    if (selectedRegion?.element?.isConnected) {
      selectedRegion.element.classList.remove("custom-ai-assistant-selected-region");
    }
    selectedRegion = null;
    chrome.runtime.sendMessage({ type: "REGION_CLEARED" });
  }

  function getSelectedRegionSnapshot() {
    if (!selectedRegion?.element?.isConnected) {
      selectedRegion = null;
      return null;
    }
    const text = normalizeText(selectedRegion.element.innerText || selectedRegion.text || "");
    if (!text) return null;
    return {
      id: selectedRegion.id,
      label: selectedRegion.label,
      text,
      chars: text.length
    };
  }

  function getContextRoot() {
    return selectedRegion?.element?.isConnected ? selectedRegion.element : null;
  }

  function collectTranslatableBlocks(limit) {
    const root = getContextRoot() || getReadableRoot();
    if (!root) return [];
    const nodes = [];
    if (root.matches?.(TRANSLATABLE_SELECTOR)) {
      nodes.push(root);
    }
    nodes.push(...root.querySelectorAll(TRANSLATABLE_SELECTOR));

    const seen = new Set();
    const blocks = [];
    for (const node of nodes) {
      if (blocks.length >= limit) break;
      if (!isTranslatableNode(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      const key = text.slice(0, 220);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({
        id: ensureElementId(node),
        tag: node.tagName.toLowerCase(),
        text
      });
    }
    return blocks;
  }

  function isTranslatableNode(node) {
    if (!node || isExtensionNode(node) || node.closest(SKIP_SELECTOR)) return false;
    if (!isVisible(node)) return false;
    const text = normalizeText(node.innerText || node.textContent || "");
    if (text.length < 8 || text.length > 1800) return false;
    if (/^[\d\s.,:;!?()[\]{}'"“”‘’\-_/\\|]+$/.test(text)) return false;
    return !hasLargeTranslatableChildren(node);
  }

  function hasLargeTranslatableChildren(node) {
    for (const child of node.querySelectorAll(TRANSLATABLE_SELECTOR)) {
      if (child === node || child.closest(".custom-ai-assistant-inline-translation")) continue;
      const text = normalizeText(child.innerText || child.textContent || "");
      if (text.length >= 8) return true;
    }
    return false;
  }

  function applyTranslations(translations) {
    for (const item of translations) {
      const id = String(item?.id || "").trim();
      const text = String(item?.text || "").trim();
      if (!id || !text) continue;
      const node = findTranslationSource(id);
      if (!node) continue;
      applyTranslationAfterNode(node, text, id);
    }
    setTranslationsHidden(false);
  }

  function applySelectionTranslation(translation) {
    const text = String(translation || "").trim();
    if (!text) return;

    let source = null;
    if (lastSelectionRange && !lastSelectionRange.collapsed) {
      const marker = document.createElement("span");
      marker.className = "custom-ai-assistant-translated-original";
      marker.dataset.customAiTranslationId = `selection-${Date.now()}`;
      try {
        lastSelectionRange.surroundContents(marker);
        source = marker;
      } catch {
        source = getSelectionFallbackNode();
      }
    }
    source ||= getSelectionFallbackNode();
    if (!source) return;
    const id = ensureElementId(source, "selection");
    applyTranslationAfterNode(source, text, id);
    window.getSelection()?.removeAllRanges();
  }

  function getSelectionFallbackNode() {
    const node = lastSelectionRange?.commonAncestorContainer;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest(TRANSLATABLE_SELECTOR) || element;
  }

  function applyTranslationAfterNode(node, text, id) {
    node.classList.add("custom-ai-assistant-translated-original");
    node.dataset.customAiTranslationId = id;

    let translation = document.querySelector(`.custom-ai-assistant-inline-translation[data-custom-ai-source-id="${id}"]`);
    if (!translation) {
      const tagName = node.tagName.toLowerCase();
      translation = document.createElement(tagName === "li" ? "li" : tagName === "span" ? "span" : "div");
      translation.className = "custom-ai-assistant-inline-translation";
      translation.dataset.customAiSourceId = id;
      node.insertAdjacentElement("afterend", translation);
    }
    translation.textContent = text;
  }

  function setTranslationsHidden(hidden) {
    document.documentElement.classList.toggle("custom-ai-assistant-hide-translations", hidden);
  }

  function clearTranslations() {
    for (const node of document.querySelectorAll(".custom-ai-assistant-inline-translation")) {
      node.remove();
    }
    for (const node of document.querySelectorAll(".custom-ai-assistant-translated-original")) {
      node.classList.remove("custom-ai-assistant-translated-original");
      delete node.dataset.customAiTranslationId;
    }
    setTranslationsHidden(false);
  }

  function findTranslationSource(id) {
    for (const node of document.querySelectorAll("[data-custom-ai-translation-id]")) {
      if (node.dataset.customAiTranslationId === id) return node;
    }
    return null;
  }

  function clearPickerHighlight() {
    highlightedPickNode?.classList.remove("custom-ai-assistant-pick-hover");
    highlightedPickNode = null;
  }

  function buildElementLabel(node) {
    const tag = node.tagName.toLowerCase();
    const heading = node.querySelector?.("h1,h2,h3,h4")?.innerText?.trim();
    const text = heading || normalizeText(node.innerText || node.textContent || "").slice(0, 48);
    return `${tag}${text ? ` · ${text}` : ""}`;
  }

  function ensureElementId(node, prefix = "block") {
    if (!node.dataset.customAiTranslationId) {
      node.dataset.customAiTranslationId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return node.dataset.customAiTranslationId;
  }

  function isExtensionNode(node) {
    return Boolean(node?.closest?.(`#${TOOLBAR_ID},#${SEARCH_PANEL_ID},#${LAUNCHER_ID},.custom-ai-assistant-inline-translation`));
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
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
