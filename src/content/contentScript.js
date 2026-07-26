(() => {
  const isTopFrame = window.top === window;
  const TOOLBAR_ID = "custom-ai-assistant-selection-toolbar";
  const SEARCH_PANEL_ID = "custom-ai-assistant-search-panel";
  const DOCK_ID = "custom-ai-assistant-dock";
  const LAUNCHER_ID = "custom-ai-assistant-launcher";
  const QUICK_RAIL_ID = "custom-ai-assistant-quick-rail";
  const FLOATING_CHAT_CLASS = "custom-ai-assistant-floating-chat";
  const SESSION_PICKER_CLASS = "custom-ai-assistant-session-picker";
  const DOCK_STATE_KEY = "customAiAssistantDockState";
  const FLOATING_CHAT_IDLE_MS = 5 * 60 * 1000;
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
    `#${DOCK_ID}`,
    `#${LAUNCHER_ID}`,
    `#${QUICK_RAIL_ID}`,
    `.${FLOATING_CHAT_CLASS}`,
    `.${SESSION_PICKER_CLASS}`,
    ".custom-ai-assistant-inline-translation"
  ].join(",");

  let lastSelection = "";
  let lastSelectionRange = null;
  let selectedRegion = null;
  let pickMode = false;
  let highlightedPickNode = null;
  let dockDragStart = null;
  const floatingCompressionTimers = new Map();

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

  if (isTopFrame) {
    maybeInjectSearchPanel();
    injectFloatingLauncher();
  }

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
        <button data-action="floating-chat">对话</button>
      `;
      toolbar.addEventListener("mousedown", (event) => event.preventDefault());
      toolbar.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "floating-chat") {
          openFloatingChatFromSelection(rect);
          hideToolbar();
          return;
        }
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
    if (document.getElementById(DOCK_ID)) return;
    const dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.innerHTML = `<button type="button" class="caa-dock-edge-toggle" title="贴边隐藏/展开" aria-label="贴边隐藏或展开">‹</button>`;
    dock.appendChild(createQuickRail());
    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open AI Assistant");
    launcher.title = "点击打开侧边栏，拖动调整位置";
    launcher.innerHTML = `
      <span class="caa-launcher-mark" aria-hidden="true">AI</span>
      <span class="caa-launcher-dot" aria-hidden="true"></span>
    `;
    dock.appendChild(launcher);
    document.documentElement.appendChild(dock);
    enableDockInteractions(dock, launcher);
    restoreDockState(dock);
  }

  function createQuickRail() {
    const rail = document.createElement("div");
    rail.id = QUICK_RAIL_ID;
    rail.innerHTML = `
      <button type="button" data-floating-action="chat" title="页面浮窗对话" aria-label="页面浮窗对话">问</button>
      <button type="button" data-floating-action="screenshot" title="截图浮窗问答" aria-label="截图浮窗问答">图</button>
    `;
    rail.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-floating-action]");
      if (!button) return;
      if (button.dataset.floatingAction === "chat") {
        await openFloatingSessionPicker(button.getBoundingClientRect(), { preferredSide: "left" });
      }
      if (button.dataset.floatingAction === "screenshot") {
        await openFloatingChatFromScreenshot(button.getBoundingClientRect(), { preferredSide: "left" });
      }
    });
    return rail;
  }

  function enableDockInteractions(dock, launcher) {
    const edgeToggle = dock.querySelector(".caa-dock-edge-toggle");
    launcher.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (dock.classList.contains("is-edge-hidden")) {
        setDockEdgeHidden(dock, false, { persist: false });
      }
      const rect = dock.getBoundingClientRect();
      dockDragStart = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      dock.classList.add("is-dragging");
      event.preventDefault();
    });
    launcher.addEventListener("click", (event) => {
      if (dock.dataset.dragged === "true") {
        event.preventDefault();
        dock.dataset.dragged = "false";
        return;
      }
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    edgeToggle.addEventListener("click", () => toggleDockEdge(dock));
    document.addEventListener("mousemove", (event) => {
      if (!dockDragStart) return;
      const dx = event.clientX - dockDragStart.x;
      const dy = event.clientY - dockDragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        dockDragStart.moved = true;
        dock.dataset.dragged = "true";
      }
      placeDockAt(dock, dockDragStart.left + dx, dockDragStart.top + dy);
    });
    document.addEventListener("mouseup", () => {
      if (!dockDragStart) return;
      dock.classList.remove("is-dragging");
      saveDockState(dock, { edgeHidden: false });
      dockDragStart = null;
    });
    window.addEventListener("resize", () => clampDockToViewport(dock), { passive: true });
  }

  async function restoreDockState(dock) {
    const saved = await chrome.storage.local.get(DOCK_STATE_KEY).catch(() => ({}));
    const state = saved[DOCK_STATE_KEY] || {};
    if (Number.isFinite(state.left) && Number.isFinite(state.top)) {
      placeDockAt(dock, state.left, state.top);
    }
    setDockEdgeHidden(dock, Boolean(state.edgeHidden), { persist: false });
  }

  function toggleDockEdge(dock) {
    setDockEdgeHidden(dock, !dock.classList.contains("is-edge-hidden"));
  }

  function setDockEdgeHidden(dock, hidden, options = {}) {
    const rect = dock.getBoundingClientRect();
    if (hidden) {
      dock.dataset.visibleLeft = String(Math.round(rect.left));
      dock.dataset.visibleTop = String(Math.round(rect.top));
      dock.style.left = "auto";
      dock.style.right = "0px";
      dock.style.top = `${clamp(rect.top, 8, window.innerHeight - dock.offsetHeight - 8)}px`;
      dock.style.bottom = "auto";
      dock.classList.add("is-edge-hidden");
      dock.querySelector(".caa-dock-edge-toggle").textContent = "›";
    } else {
      dock.classList.remove("is-edge-hidden");
      dock.querySelector(".caa-dock-edge-toggle").textContent = "‹";
      const left = Number(dock.dataset.visibleLeft);
      const top = Number(dock.dataset.visibleTop);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        placeDockAt(dock, left, top);
      }
    }
    if (options.persist !== false) {
      saveDockState(dock, { edgeHidden: hidden });
    }
  }

  function placeDockAt(dock, left, top) {
    const width = dock.offsetWidth || 48;
    const height = dock.offsetHeight || 104;
    dock.style.left = `${clamp(left, 8, window.innerWidth - width - 8)}px`;
    dock.style.top = `${clamp(top, 8, window.innerHeight - height - 8)}px`;
    dock.style.right = "auto";
    dock.style.bottom = "auto";
  }

  function clampDockToViewport(dock) {
    if (dock.classList.contains("is-edge-hidden")) {
      const top = clamp(dock.getBoundingClientRect().top, 8, window.innerHeight - dock.offsetHeight - 8);
      dock.style.top = `${top}px`;
      saveDockState(dock, { edgeHidden: true });
      return;
    }
    const rect = dock.getBoundingClientRect();
    placeDockAt(dock, rect.left, rect.top);
    saveDockState(dock, { edgeHidden: false });
  }

  function saveDockState(dock, patch = {}) {
    const rect = dock.getBoundingClientRect();
    const visibleLeft = Number(dock.dataset.visibleLeft);
    const visibleTop = Number(dock.dataset.visibleTop);
    const edgeHidden = patch.edgeHidden ?? dock.classList.contains("is-edge-hidden");
    const left = edgeHidden && Number.isFinite(visibleLeft) ? visibleLeft : rect.left;
    const top = edgeHidden && Number.isFinite(visibleTop) ? visibleTop : rect.top;
    chrome.storage.local.set({
      [DOCK_STATE_KEY]: {
        left: Math.round(left),
        top: Math.round(top),
        edgeHidden
      }
    }).catch(() => {});
  }

  async function openFloatingChatFromSelection() {
    const rect = lastSelectionRange?.getBoundingClientRect() || {
      left: window.innerWidth - 380,
      right: window.innerWidth - 16,
      top: window.innerHeight - 120,
      bottom: window.innerHeight - 96
    };
    await openFloatingChat({
      type: "selection",
      label: "选中文本",
      title: document.title,
      text: lastSelection
    }, rect);
  }

  async function openFloatingChatFromScreenshot(anchorRect, placement = {}) {
    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }).catch((error) => ({
      ok: false,
      error: error.message
    }));
    if (!response?.ok || !response.imageDataUrl) {
      await openFloatingChat({
        type: "page",
        label: "截图失败",
        title: document.title,
        text: `截图失败：${response?.error || "无法截取当前页面"}`
      }, anchorRect, null, placement);
      return;
    }
    await openFloatingChat({
      type: "screenshot",
      label: "当前页面截图",
      title: document.title,
      text: "当前网页可视区域截图",
      imageDataUrl: response.imageDataUrl,
      hasImage: true
    }, anchorRect, null, placement);
  }

  async function openFloatingSessionPicker(anchorRect, placement = {}) {
    const loaded = await chrome.runtime.sendMessage({
      type: "FLOATING_CHAT_LOAD",
      pageUrl: location.href
    }).catch(() => ({ ok: false, sessions: [] }));
    const sessions = loaded?.sessions || [];
    if (!sessions.length) {
      await openFloatingChat(buildPageFloatingSource(), anchorRect, null, placement);
      return;
    }

    const picker = document.createElement("section");
    picker.className = "custom-ai-assistant-session-picker";
    picker.innerHTML = `
      <header>
        <strong>当前网页会话</strong>
        <button type="button" data-picker-action="close">关闭</button>
      </header>
      <div class="caa-session-picker-list"></div>
      <button type="button" class="caa-session-picker-new" data-picker-action="new">新建会话</button>
    `;
    const list = picker.querySelector(".caa-session-picker-list");
    for (const session of sessions.slice(0, 6)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.sessionId = session.id;
      button.textContent = `${session.title || "浮窗会话"} · ${new Date(session.updatedAt || session.createdAt || Date.now()).toLocaleString()}`;
      button.addEventListener("click", async () => {
        picker.remove();
        await openFloatingChat(session.source || buildPageFloatingSource(), anchorRect, session, placement);
      });
      list.append(button);
    }
    picker.querySelector("[data-picker-action='close']").addEventListener("click", () => picker.remove());
    picker.querySelector("[data-picker-action='new']").addEventListener("click", async () => {
      picker.remove();
      await openFloatingChat(buildPageFloatingSource(), anchorRect, null, placement);
    });
    document.documentElement.appendChild(picker);
    placeFloatingDialog(picker, anchorRect, placement);
  }

  async function openFloatingChat(source, anchorRect, existingSession = null, placement = {}) {
    const start = existingSession ? { ok: true, session: existingSession } : await chrome.runtime.sendMessage({
      type: "FLOATING_CHAT_START",
      pageUrl: location.href,
      pageTitle: document.title,
      source: serializeFloatingSource(source)
    }).catch((error) => ({ ok: false, error: error.message }));

    const dialog = createFloatingChatDialog(source, start?.session);
    document.documentElement.appendChild(dialog);
    placeFloatingDialog(dialog, anchorRect, placement);
    enableFloatingDialogDrag(dialog);

    if (!start?.ok) {
      addFloatingChatMessage(dialog, "error", start?.error || "无法创建浮窗会话");
      return;
    }
    renderFloatingSessionMessages(dialog, start.session);
    scheduleFloatingCompression(start.session.id);
    dialog.querySelector("textarea").focus();
  }

  function buildPageFloatingSource() {
    return {
      type: "page",
      label: "当前网页",
      title: document.title,
      text: collectReadableText()
    };
  }

  function createFloatingChatDialog(source, session) {
    const dialog = document.createElement("section");
    dialog.className = FLOATING_CHAT_CLASS;
    dialog.dataset.sessionId = session?.id || "";
    dialog.innerHTML = `
      <header class="caa-floating-chat-header">
        <div>
          <strong>${escapeHtml(session?.title || source.label || "浮窗会话")}</strong>
          <span>${escapeHtml(buildFloatingSourceLabel(source))}</span>
        </div>
        <div class="caa-floating-chat-controls">
          <button type="button" data-floating-control="new">新会话</button>
          <button type="button" data-floating-control="minimize">收起</button>
          <button type="button" data-floating-control="close">关闭</button>
        </div>
      </header>
      <div class="caa-floating-chat-source">${buildFloatingSourcePreview(source)}</div>
      <div class="caa-floating-chat-messages" role="log" aria-live="polite"></div>
      <form class="caa-floating-chat-form">
        <textarea rows="2" placeholder="基于这个选区、截图或网页继续提问"></textarea>
        <button type="submit">发送</button>
      </form>
    `;

    dialog.querySelector("[data-floating-control='close']").addEventListener("click", () => dialog.remove());
    dialog.querySelector("[data-floating-control='minimize']").addEventListener("click", () => {
      dialog.classList.toggle("is-minimized");
    });
    dialog.querySelector("[data-floating-control='new']").addEventListener("click", () => {
      const rect = dialog.getBoundingClientRect();
      openFloatingChat(source, rect);
    });
    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = dialog.querySelector("textarea");
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = "";
      await sendFloatingChatPrompt(dialog, source, prompt);
    });
    return dialog;
  }

  async function sendFloatingChatPrompt(dialog, source, prompt) {
    const sessionId = dialog.dataset.sessionId;
    if (!sessionId) {
      addFloatingChatMessage(dialog, "error", "浮窗会话尚未初始化。");
      return;
    }
    addFloatingChatMessage(dialog, "user", prompt);
    const pending = addFloatingChatMessage(dialog, "assistant", "正在思考...");
    setFloatingChatBusy(dialog, true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FLOATING_CHAT_MESSAGE",
        sessionId,
        pageUrl: location.href,
        pageTitle: document.title,
        source: serializeFloatingSource(source),
        prompt
      });
      if (!response?.ok) {
        throw new Error(response?.error || "请求失败");
      }
      pending.querySelector(".caa-floating-chat-bubble").textContent = response.answer || "(无内容)";
      dialog.dataset.sessionId = response.session?.id || sessionId;
      scheduleFloatingCompression(dialog.dataset.sessionId);
    } catch (error) {
      pending.classList.add("error");
      pending.querySelector(".caa-floating-chat-role").textContent = "ERROR";
      pending.querySelector(".caa-floating-chat-bubble").textContent = error.message;
    } finally {
      setFloatingChatBusy(dialog, false);
    }
  }

  function addFloatingChatMessage(dialog, role, content) {
    const row = document.createElement("article");
    row.className = `caa-floating-chat-message ${role}`;
    row.innerHTML = `
      <div class="caa-floating-chat-role">${escapeHtml(role.toUpperCase())}</div>
      <div class="caa-floating-chat-bubble"></div>
    `;
    row.querySelector(".caa-floating-chat-bubble").textContent = content;
    const list = dialog.querySelector(".caa-floating-chat-messages");
    list.append(row);
    list.scrollTop = list.scrollHeight;
    return row;
  }

  function renderFloatingSessionMessages(dialog, session) {
    const list = dialog.querySelector(".caa-floating-chat-messages");
    list.textContent = "";
    if (session?.memorySummary) {
      addFloatingChatMessage(dialog, "memory", `已载入压缩记忆：${session.memorySummary}`);
    }
    for (const message of session?.messages || []) {
      addFloatingChatMessage(dialog, message.role, message.content);
    }
    if (!session?.messages?.length) {
      addFloatingChatMessage(dialog, "assistant", "已创建独立浮窗会话。这个会话会按当前网页保存，5 分钟空闲后自动压缩记忆。");
    }
  }

  function setFloatingChatBusy(dialog, busy) {
    dialog.querySelector("textarea").disabled = busy;
    dialog.querySelector("button[type='submit']").disabled = busy;
  }

  function scheduleFloatingCompression(sessionId) {
    if (!sessionId) return;
    window.clearTimeout(floatingCompressionTimers.get(sessionId));
    floatingCompressionTimers.set(sessionId, window.setTimeout(() => {
      chrome.runtime.sendMessage({ type: "FLOATING_CHAT_COMPRESS", sessionId }).catch(() => {});
      floatingCompressionTimers.delete(sessionId);
    }, FLOATING_CHAT_IDLE_MS));
  }

  function serializeFloatingSource(source) {
    return {
      type: source.type || "page",
      label: source.label || "",
      title: source.title || document.title,
      text: source.text || "",
      hasImage: Boolean(source.hasImage || source.imageDataUrl),
      imageDataUrl: source.imageDataUrl || ""
    };
  }

  function buildFloatingSourceLabel(source) {
    if (source.type === "screenshot") return "截图 · 当前页面";
    if (source.type === "selection") return "选区 · 当前页面";
    return "网页 · 当前页面";
  }

  function buildFloatingSourcePreview(source) {
    if (source.type === "screenshot" && source.imageDataUrl) {
      return `<img src="${source.imageDataUrl}" alt="当前页面截图">`;
    }
    const text = String(source.text || "").trim();
    return `<blockquote>${escapeHtml(text.slice(0, 420) || "当前网页上下文")}</blockquote>`;
  }

  function placeFloatingDialog(dialog, anchorRect, options = {}) {
    const width = Math.min(380, window.innerWidth - 16);
    const estimatedHeight = Math.min(520, window.innerHeight - 24);
    const gap = 10;
    const leftSpace = anchorRect.left - gap - 8;
    const rightSpace = window.innerWidth - anchorRect.right - gap - 8;
    let left = anchorRect.left;
    if (options.preferredSide === "left" && leftSpace >= Math.min(width, 260)) {
      left = anchorRect.left - width - gap;
    } else if (options.preferredSide === "right" && rightSpace >= Math.min(width, 260)) {
      left = anchorRect.right + gap;
    } else if (rightSpace >= width) {
      left = anchorRect.right + gap;
    } else if (leftSpace >= width) {
      left = anchorRect.left - width - gap;
    }
    left = clamp(left, 8, window.innerWidth - width - 8);
    const top = anchorRect.bottom + 10;
    dialog.style.width = `${width}px`;
    dialog.style.left = `${left}px`;
    dialog.style.right = "auto";
    dialog.style.bottom = "auto";
    if (top + estimatedHeight > window.innerHeight - 8) {
      dialog.style.top = "auto";
      dialog.style.bottom = "72px";
    } else {
      dialog.style.top = `${Math.max(8, top)}px`;
    }
  }

  function enableFloatingDialogDrag(dialog) {
    const header = dialog.querySelector(".caa-floating-chat-header");
    let start = null;
    header.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) return;
      const rect = dialog.getBoundingClientRect();
      start = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top
      };
      event.preventDefault();
    });
    document.addEventListener("mousemove", (event) => {
      if (!start) return;
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      dialog.style.left = `${clamp(start.left + event.clientX - start.x, 8, window.innerWidth - width - 8)}px`;
      dialog.style.top = `${clamp(start.top + event.clientY - start.y, 8, window.innerHeight - height - 8)}px`;
      dialog.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
      start = null;
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
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
    return Boolean(node?.closest?.(`#${TOOLBAR_ID},#${SEARCH_PANEL_ID},#${DOCK_ID},#${LAUNCHER_ID},#${QUICK_RAIL_ID},.${FLOATING_CHAT_CLASS},.${SESSION_PICKER_CLASS},.custom-ai-assistant-inline-translation`));
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
