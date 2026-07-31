(() => {
  const isTopFrame = window.top === window;
  const TOOLBAR_ID = "custom-ai-assistant-selection-toolbar";
  const SELECTION_ACTION_LABELS = {
    explain: "解释选中文本",
    translate: "翻译选中文本",
    summarize: "总结选中文本",
    rewrite: "改写选中文本",
    continue: "续写选中文本"
  };
  const SEARCH_PANEL_ID = "custom-ai-assistant-search-panel";
  const DOCK_ID = "custom-ai-assistant-dock";
  const LAUNCHER_ID = "custom-ai-assistant-launcher";
  const QUICK_RAIL_ID = "custom-ai-assistant-quick-rail";
  const FLOATING_CHAT_CLASS = "custom-ai-assistant-floating-chat";
  const SESSION_PICKER_CLASS = "custom-ai-assistant-session-picker";
  const EXTENSION_UI_SELECTOR = `#${TOOLBAR_ID},#${SEARCH_PANEL_ID},#${DOCK_ID},#${LAUNCHER_ID},#${QUICK_RAIL_ID},.${FLOATING_CHAT_CLASS},.${SESSION_PICKER_CLASS},.custom-ai-assistant-inline-translation`;
  const DOCK_STATE_KEY = "customAiAssistantDockState";
  const FLOATING_CHAT_IDLE_MS = 5 * 60 * 1000;
  const REFRESH_PAGE_MESSAGE = "扩展已更新，请刷新页面后重试。";
  const PAGE_CODE_MAX_CHARS = 24000;
  const PAGE_TASK_MAX_ACTIONS = 12;
  const PAGE_TASK_INTERVAL_MIN_SECONDS = 10;
  const PAGE_TASK_INTERVAL_MAX_SECONDS = 3600;
  const PAGE_TASK_ACTION_TYPES = new Set(["inspect", "click", "setValue", "setText", "setAttribute", "setStyle", "remove", "scroll"]);
  const PAGE_TASK_STYLE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
  const PAGE_TASK_BLOCKED_STYLE_VALUE = /url\s*\(|expression\s*\(|@import|javascript\s*:|-moz-binding/i;
  const PAGE_TASK_FIELDS = new Set(["id", "nonce", "documentToken", "rootId", "tabId", "url", "origin", "title", "summary", "scope", "intervalSeconds", "actions", "state", "createdAt", "updatedAt", "lastRunAt", "lastError"]);
  const TRANSLATABLE_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dd,dt,summary";
  const TRANSLATION_FALLBACK_SELECTOR = "article,section,div";
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
  const pageTaskDocumentToken = crypto.randomUUID();
  const localPageTasks = new Map();

  function hasExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  async function sendRuntimeMessage(message, fallback) {
    if (!hasExtensionContext()) return fallback;
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return fallback;
    }
  }

  async function getLocalStorage(keys, fallback = {}) {
    if (!hasExtensionContext()) return fallback;
    try {
      return await chrome.storage.local.get(keys);
    } catch {
      return fallback;
    }
  }

  async function setLocalStorage(values) {
    if (!hasExtensionContext()) return false;
    try {
      await chrome.storage.local.set(values);
      return true;
    } catch {
      return false;
    }
  }

  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keyup", handleSelection);
  document.addEventListener("scroll", hideToolbar, { passive: true });
  document.addEventListener("focusin", markEditable, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_PAGE") {
      sendResponse({ ok: true, page: extractPage(message.recipeSelectors) });
      return true;
    }
    if (message?.type === "GET_PAGE_CANDIDATES") {
      const type = detectPageType(location.href, document.contentType);
      sendResponse({
        ok: true,
        page: { type, title: document.title, url: location.href },
        candidates: buildPageCandidates().map(toPublicPageCandidate)
      });
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
      sendResponse({ ok: true, blocks: collectTranslatableBlocks(message.limit || 48, message.recipeSelectors), context: buildContextStatus() });
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
    if (!isTopFrame) return false;
    if (message?.type === "EXTRACT_PAGE_CODE") {
      try {
        sendResponse({ ok: true, snapshot: extractPageCodeSnapshot() });
      } catch (error) {
        sendResponse(pageTaskError(error));
      }
      return true;
    }
    if (message?.type === "PREVIEW_PAGE_ACTIONS") {
      try {
        const request = validatePageActionRequest(message, new Set(["immediate", "background"]));
        sendResponse({ ok: true, previews: previewPageActions(request) });
      } catch (error) {
        sendResponse(pageTaskError(error));
      }
      return true;
    }
    if (message?.type === "EXECUTE_PAGE_ACTIONS") {
      try {
        const request = validatePageActionRequest(message, new Set(["immediate"]));
        sendResponse(executePageActions(request));
      } catch (error) {
        sendResponse(pageTaskError(error));
      }
      return true;
    }
    if (message?.type === "VERIFY_PAGE_TASK_TARGET") {
      sendResponse({ ok: message.documentToken === pageTaskDocumentToken && message.url === location.href });
      return true;
    }
    if (message?.type === "START_PAGE_TASK") {
      try {
        const task = validateLocalPageTask(message.task);
        installLocalPageTask(task);
        sendResponse({ ok: true });
        window.setTimeout(() => void runLocalPageTask(task.id), 0);
      } catch (error) {
        sendResponse(pageTaskError(error));
      }
      return true;
    }
    if (message?.type === "STOP_PAGE_TASK") {
      stopLocalPageTask(message.taskId, message.nonce);
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  if (isTopFrame) {
    maybeInjectSearchPanel();
    injectFloatingLauncher();
    window.setTimeout(announcePageTaskDocumentReady, 0);
  }

  function extractPageCodeSnapshot() {
    const region = getSelectedRegionSnapshot();
    const root = region ? getContextRoot() : document.documentElement;
    if (!root) throw new TypeError("Page root is unavailable");
    const clone = root.cloneNode(true);
    sanitizePageCodeClone(clone);
    const fullCode = clone.outerHTML;
    const truncated = fullCode.length > PAGE_CODE_MAX_CHARS;
    return {
      title: document.title,
      url: location.href,
      scope: region ? "selected-region" : "page",
      label: region?.label || "当前网页",
      code: fullCode.slice(0, PAGE_CODE_MAX_CHARS),
      truncated,
      documentToken: pageTaskDocumentToken,
      rootId: region?.id || null
    };
  }

  function sanitizePageCodeClone(root) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      if (isSnapshotExcludedNode(node)) node.remove();
    }
    for (const node of nodes) {
      if (node !== root && !node.parentNode) continue;
      if (node.matches("script,style")) node.textContent = "";
      if (node.matches("textarea")) {
        node.value = "";
        node.textContent = "";
      }
      if (node.matches("input")) {
        node.value = "";
        node.removeAttribute("value");
      }
      if (node.matches("[contenteditable]")) {
        node.textContent = "";
        node.removeAttribute("value");
      }
      sanitizeSnapshotAttributes(node);
    }
  }

  function isSnapshotExcludedNode(node) {
    if (node.matches("template,noscript,[hidden]")) return true;
    if (node.matches("input")) {
      const type = String(node.getAttribute("type") || "").toLowerCase();
      if (["hidden", "password", "file"].includes(type)) return true;
    }
    return isExtensionNode(node) || [TOOLBAR_ID, SEARCH_PANEL_ID, DOCK_ID, LAUNCHER_ID, QUICK_RAIL_ID].includes(node.id) || node.matches(`.${FLOATING_CHAT_CLASS},.${SESSION_PICKER_CLASS},.custom-ai-assistant-inline-translation`);
  }

  function sanitizeSnapshotAttributes(node) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === "class") {
        const classes = attribute.value.split(/\s+/).filter((item) => item && !item.startsWith("custom-ai-assistant-"));
        if (classes.length) node.setAttribute("class", classes.join(" "));
        else node.removeAttribute("class");
        continue;
      }
      if (!isSafeSnapshotAttribute(name)) {
        node.removeAttribute(attribute.name);
        continue;
      }
      if (name === "href" || name === "src") {
        const value = safeSnapshotUrl(attribute.value);
        if (value) node.setAttribute(name, value);
        else node.removeAttribute(attribute.name);
      } else if (attribute.value.length > 1000) {
        node.setAttribute(attribute.name, attribute.value.slice(0, 1000));
      }
    }
  }

  function isSafeSnapshotAttribute(name) {
    return ["id", "class", "role", "name", "type", "placeholder", "title", "alt", "for", "href", "src"].includes(name) ||
      /^aria-[a-z0-9_-]+$/.test(name) || /^data-(testid|test|role)$/.test(name);
  }

  function safeSnapshotUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function validatePageActionRequest(message, allowedModes) {
    rejectUnknownPageTaskFields(message, new Set(["type", "documentToken", "url", "rootId", "actions", "mode"]));
    if (message.documentToken !== pageTaskDocumentToken || message.url !== location.href) throw new TypeError("Page document changed");
    const mode = pageTaskEnum(message.mode, allowedModes, "mode");
    const root = resolvePageTaskRoot(message.rootId);
    const actions = normalizePageTaskActions(message.actions);
    if (!actions.length) throw new TypeError("Action mode requires actions");
    if (mode === "background") actions.forEach(assertBackgroundActionAllowed);
    return { mode, root, actions };
  }

  function resolvePageTaskRoot(rootId) {
    if (rootId === undefined || rootId === null) return document;
    const id = pageTaskNonempty(rootId, "rootId", 128);
    recoverSelectedRegion();
    const root = findTranslationSource(id);
    if (!root?.isConnected || root !== selectedRegion?.element || selectedRegion.id !== id || root.dataset.customAiTranslationId !== id) {
      throw new TypeError("Selected page region changed");
    }
    return root;
  }

  function previewPageActions({ mode, root, actions }) {
    return actions.map((action) => {
      let target;
      try {
        target = findPageActionTarget(root, action, false);
      } catch (error) {
        return { type: action.type, selector: action.selector || null, target: "未找到目标", risk: "none", error: pageTaskMessage(error, 500) };
      }
      if (!target && !(action.type === "scroll" && action.selector === undefined)) {
        return { type: action.type, selector: action.selector || null, target: "未找到目标", risk: "none", error: "Action target not found" };
      }
      if (mode === "background") assertBackgroundActionAllowed(action);
      return {
        type: action.type,
        selector: action.selector || null,
        target: target ? pageActionTargetLabel(target) : "页面",
        risk: pageActionRisk(action, target)
      };
    });
  }

  function executePageActions({ mode, root, actions }) {
    const results = [];
    for (const [index, action] of actions.entries()) {
      try {
        const target = findPageActionTarget(root, action, true);
        if (mode === "background") assertBackgroundActionAllowed(action);
        const result = executePageAction(action, target);
        results.push(pageActionResult(index, action, true, result));
      } catch (error) {
        const message = pageTaskMessage(error, 500);
        results.push(pageActionResult(index, action, false, { error: message }));
        return { ok: false, error: message, results };
      }
    }
    return { ok: true, results };
  }

  function findPageActionTarget(root, action, required) {
    if (action.type === "scroll" && action.selector === undefined) return null;
    if (root !== document && !root.isConnected) throw new TypeError("Page root is unavailable");
    let target;
    try {
      target = root === document ? document.querySelector(action.selector) : (root.matches(action.selector) ? root : root.querySelector(action.selector));
    } catch {
      throw new TypeError("Invalid action selector");
    }
    if (!target && required) throw new TypeError("Action target not found");
    if (target && (target === document.documentElement || target === document.body || isExtensionNode(target) || target.querySelector(EXTENSION_UI_SELECTOR) || target.matches("script,style,template,noscript"))) throw new TypeError("Unsafe action target");
    return target;
  }

  function executePageAction(action, target) {
    if (action.type === "inspect") {
      return action.property === "text"
        ? { text: normalizeText(target.innerText || target.textContent || "").slice(0, 2000) }
        : { attributes: safePageActionAttributes(target) };
    }
    if (action.type === "click") {
      target.click();
      return { target: pageActionTargetLabel(target) };
    }
    if (action.type === "setValue") {
      if (!isPageTaskValueTarget(target)) throw new TypeError("setValue requires a non-sensitive editable target");
      if (target.isContentEditable) target.textContent = action.value;
      else target.value = action.value;
      dispatchPageTaskInputEvents(target);
      return { target: pageActionTargetLabel(target) };
    }
    if (action.type === "setText") {
      target.textContent = action.value;
      return { target: pageActionTargetLabel(target) };
    }
    if (action.type === "setAttribute") {
      target.setAttribute(action.name, action.value);
      return { target: pageActionTargetLabel(target), name: action.name };
    }
    if (action.type === "setStyle") {
      for (const [name, value] of Object.entries(action.styles)) target.style.setProperty(name, value);
      return { target: pageActionTargetLabel(target), styles: Object.keys(action.styles) };
    }
    if (action.type === "remove") {
      target.remove();
      return { target: pageActionTargetLabel(target) };
    }
    if (target) target.scrollIntoView({ behavior: action.behavior, block: "nearest" });
    else window.scrollBy({ top: action.amount, behavior: action.behavior });
    return { target: target ? pageActionTargetLabel(target) : "页面" };
  }

  function isPageTaskValueTarget(target) {
    if (target.isContentEditable || target.matches("textarea")) return true;
    if (!target.matches("input")) return false;
    return !["password", "file", "hidden"].includes(String(target.type || "").toLowerCase());
  }

  function dispatchPageTaskInputEvents(target) {
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function safePageActionAttributes(target) {
    const attributes = {};
    for (const attribute of [...target.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!isSafeSnapshotAttribute(name) || Object.keys(attributes).length >= 12) continue;
      if (name === "href" || name === "src") {
        const value = safeSnapshotUrl(attribute.value);
        if (value) attributes[name] = value;
      } else if (name === "class") {
        attributes[name] = attribute.value.split(/\s+/).filter((item) => item && !item.startsWith("custom-ai-assistant-")).join(" ").slice(0, 240);
      } else {
        attributes[name] = attribute.value.slice(0, 240);
      }
    }
    return attributes;
  }

  function assertBackgroundActionAllowed(action) {
    if (action.type === "click" || action.type === "setValue") throw new TypeError("Background tasks cannot click or set values");
  }

  function pageActionRisk(action, target) {
    if (action.type !== "click" || !target) return "none";
    if (target.closest("a[href]")) return "navigation";
    if (isPageTaskSubmitControl(target)) return "form";
    return "none";
  }

  function isPageTaskSubmitControl(target) {
    const button = target.closest("button");
    if (button?.form && button.type === "submit") return true;
    const input = target.closest("input");
    return ["submit", "image"].includes(String(input?.type || "").toLowerCase());
  }

  function pageActionTargetLabel(target) {
    const tag = target.tagName.toLowerCase();
    const id = target.id ? `#${target.id}` : "";
    const name = target.getAttribute("name") ? `[name=${target.getAttribute("name")}]` : "";
    const text = normalizeText(target.getAttribute("aria-label") || target.getAttribute("title") || target.innerText || target.textContent || "").slice(0, 100);
    return `${tag}${id}${name}${text ? ` · ${text}` : ""}`.slice(0, 220);
  }

  function pageActionResult(index, action, ok, result) {
    const item = { index, type: action.type, ok, result };
    return JSON.stringify(item).length <= 4000 ? item : { index, type: action.type, ok, result: { summary: "Result truncated" } };
  }

  function normalizePageTaskActions(actions) {
    if (!Array.isArray(actions) || actions.length > PAGE_TASK_MAX_ACTIONS) throw new TypeError("Actions must contain at most 12 entries");
    return actions.map(normalizePageTaskAction);
  }

  function normalizePageTaskAction(action) {
    if (!pageTaskPlainObject(action)) throw new TypeError("Action must be an object");
    const type = pageTaskEnum(action.type, PAGE_TASK_ACTION_TYPES, "action type");
    const fields = {
      inspect: ["type", "selector", "property"], click: ["type", "selector"], setValue: ["type", "selector", "value"], setText: ["type", "selector", "value"],
      setAttribute: ["type", "selector", "name", "value"], setStyle: ["type", "selector", "styles"], remove: ["type", "selector"], scroll: ["type", "selector", "amount", "behavior"]
    }[type];
    rejectUnknownPageTaskFields(action, new Set(fields));
    const selector = type === "scroll" && action.selector === undefined ? undefined : pageTaskNonempty(action.selector, "selector", 500);
    if (type === "inspect") return { type, selector, property: pageTaskEnum(action.property, new Set(["text", "attributes"]), "property") };
    if (type === "click" || type === "remove") return { type, selector };
    if (type === "setValue" || type === "setText") return { type, selector, value: pageTaskString(action.value, "value", 4000) };
    if (type === "setAttribute") return { type, selector, name: pageTaskAttributeName(action.name), value: pageTaskString(action.value, "value", 1000) };
    if (type === "setStyle") return { type, selector, styles: pageTaskStyles(action.styles) };
    return { type, ...(selector === undefined ? {} : { selector }), amount: pageTaskInteger(action.amount, "amount", -100000, 100000), behavior: action.behavior === undefined ? "auto" : pageTaskEnum(action.behavior, new Set(["auto", "smooth"]), "behavior") };
  }

  function pageTaskStyles(styles) {
    if (!pageTaskPlainObject(styles) || Object.keys(styles).length > 12) throw new TypeError("Styles must be an object with at most 12 entries");
    const result = {};
    for (const [name, value] of Object.entries(styles)) {
      if (!PAGE_TASK_STYLE_NAME.test(name) || name.startsWith("--")) throw new TypeError("Invalid style name");
      const text = pageTaskString(value, "style value", 500);
      if (PAGE_TASK_BLOCKED_STYLE_VALUE.test(text)) throw new TypeError("Unsafe style value");
      result[name] = text;
    }
    return result;
  }

  function pageTaskAttributeName(name) {
    if (typeof name !== "string" || !/^(title|class|hidden|aria-[a-z0-9_-]+|data-[a-z0-9_-]+)$/.test(name)) throw new TypeError("Unsafe attribute name");
    return name;
  }

  function validateLocalPageTask(task) {
    rejectUnknownPageTaskFields(task, PAGE_TASK_FIELDS);
    const location = normalizePageTaskLocation(task);
    const normalized = {
      id: pageTaskNonempty(task.id, "task id", 128),
      nonce: pageTaskNonempty(task.nonce, "task nonce", 128),
      documentToken: pageTaskNonempty(task.documentToken, "documentToken", 128),
      rootId: task.rootId === null ? null : pageTaskNonempty(task.rootId, "rootId", 128),
      tabId: location.tabId,
      url: location.url,
      origin: location.origin,
      title: pageTaskString(task.title, "title", 300),
      summary: pageTaskString(task.summary, "summary", 500),
      scope: pageTaskEnum(task.scope, new Set(["document", "tab"]), "scope"),
      intervalSeconds: pageTaskInteger(task.intervalSeconds, "intervalSeconds", PAGE_TASK_INTERVAL_MIN_SECONDS, PAGE_TASK_INTERVAL_MAX_SECONDS),
      actions: normalizePageTaskActions(task.actions),
      state: pageTaskEnum(task.state, new Set(["active", "paused"]), "state"),
      createdAt: pageTaskTimestamp(task.createdAt, "createdAt"),
      updatedAt: pageTaskTimestamp(task.updatedAt, "updatedAt"),
      lastRunAt: pageTaskTimestamp(task.lastRunAt, "lastRunAt"),
      lastError: pageTaskNullableString(task.lastError, "lastError", 500)
    };
    if (!normalized.actions.length) throw new TypeError("Background task requires actions");
    normalized.actions.forEach(assertBackgroundActionAllowed);
    if (normalized.documentToken !== pageTaskDocumentToken) throw new TypeError("Page document changed");
    if (normalized.state !== "active") throw new TypeError("Page task is not active");
    if (normalized.scope === "tab" && normalized.rootId !== null) throw new TypeError("Tab-scoped tasks cannot target a selected region");
    resolvePageTaskRoot(normalized.rootId);
    return normalized;
  }

  function normalizePageTaskLocation(task) {
    const tabId = pageTaskInteger(task.tabId, "tabId", 1, Number.MAX_SAFE_INTEGER);
    try {
      const url = new URL(task.url);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== task.origin || url.origin !== location.origin || url.href !== location.href) throw new TypeError();
      return { tabId, url: url.href, origin: url.origin };
    } catch {
      throw new TypeError("Page task target changed");
    }
  }

  function installLocalPageTask(task) {
    const previous = localPageTasks.get(task.id);
    if (previous) window.clearTimeout(previous.timer);
    localPageTasks.set(task.id, { task, timer: null, running: false });
  }

  function stopLocalPageTask(taskId, nonce) {
    const runner = localPageTasks.get(taskId);
    if (!runner || runner.task.nonce !== nonce) return;
    window.clearTimeout(runner.timer);
    localPageTasks.delete(taskId);
  }

  function scheduleLocalPageTask(runner, delay) {
    window.clearTimeout(runner.timer);
    runner.timer = window.setTimeout(() => void runLocalPageTask(runner.task.id), delay);
  }

  async function runLocalPageTask(taskId) {
    const runner = localPageTasks.get(taskId);
    if (!runner || runner.running) return;
    runner.running = true;
    let keepRunning = true;
    try {
      const tick = await sendRuntimeMessage({
        type: "PAGE_TASK_TICK",
        taskId: runner.task.id,
        nonce: runner.task.nonce,
        documentToken: pageTaskDocumentToken
      }, { ok: false, error: REFRESH_PAGE_MESSAGE });
      if (!tick?.ok || !tick.task) {
        keepRunning = false;
        return;
      }
      const task = validateLocalPageTask(tick.task);
      if (task.id !== runner.task.id || task.nonce !== runner.task.nonce || task.documentToken !== pageTaskDocumentToken) {
        keepRunning = false;
        return;
      }
      runner.task = task;
      const outcome = executePageActions({ mode: "background", root: resolvePageTaskRoot(task.rootId), actions: task.actions });
      const reported = await sendRuntimeMessage({
        type: "PAGE_TASK_RESULT",
        taskId: task.id,
        nonce: task.nonce,
        documentToken: pageTaskDocumentToken,
        error: outcome.ok ? null : pageTaskMessage(outcome.error, 500)
      }, { ok: false, error: REFRESH_PAGE_MESSAGE });
      if (!reported?.ok) keepRunning = false;
    } catch (error) {
      const reported = await sendRuntimeMessage({
        type: "PAGE_TASK_RESULT",
        taskId: runner.task.id,
        nonce: runner.task.nonce,
        documentToken: pageTaskDocumentToken,
        error: pageTaskMessage(error, 500)
      }, { ok: false, error: REFRESH_PAGE_MESSAGE });
      if (!reported?.ok) keepRunning = false;
    } finally {
      runner.running = false;
      if (keepRunning && localPageTasks.get(taskId) === runner) {
        scheduleLocalPageTask(runner, runner.task.intervalSeconds * 1000);
      } else if (localPageTasks.get(taskId) === runner) {
        stopLocalPageTask(taskId, runner.task.nonce);
      }
    }
  }

  async function announcePageTaskDocumentReady() {
    const response = await sendRuntimeMessage({ type: "PAGE_TASK_DOCUMENT_READY", documentToken: pageTaskDocumentToken }, { ok: false });
    if (!response?.ok || !Array.isArray(response.tasks)) return;
    for (const task of response.tasks) {
      try {
        const normalized = validateLocalPageTask(task);
        if (normalized.state === "active") {
          installLocalPageTask(normalized);
          window.setTimeout(() => void runLocalPageTask(normalized.id), 0);
        }
      } catch {}
    }
  }

  function pageTaskPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  }

  function rejectUnknownPageTaskFields(value, allowed) {
    if (!pageTaskPlainObject(value)) throw new TypeError("Value must be an object");
    for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`Unknown field: ${key}`);
  }

  function pageTaskEnum(value, allowed, name) {
    if (!allowed.has(value)) throw new TypeError(`Invalid ${name}`);
    return value;
  }

  function pageTaskInteger(value, name, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name} is out of range`);
    return value;
  }

  function pageTaskString(value, name, max) {
    if (typeof value !== "string" || value.length > max) throw new TypeError(`${name} must be a string up to ${max} characters`);
    return value;
  }

  function pageTaskNonempty(value, name, max) {
    const text = pageTaskString(value, name, max);
    if (!text.length) throw new TypeError(`${name} cannot be empty`);
    return text;
  }

  function pageTaskNullableString(value, name, max) {
    return value === null ? null : pageTaskString(value, name, max);
  }

  function pageTaskTimestamp(value, name) {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number or null`);
    return value;
  }

  function pageTaskError(error) {
    return { ok: false, error: pageTaskMessage(error, 500) };
  }

  function pageTaskMessage(error, max) {
    return String(error?.message || error || "Page task failed").slice(0, max);
  }

  function extractPage(recipeSelectors = []) {
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
    const page = type === "youtube"
      ? extractYouTubePage()
      : { type, title: document.title, url: location.href, text: collectReadableText() };
    const requestedSelectors = normalizeRecipeSelectors(recipeSelectors);
    if (!requestedSelectors.length) {
      return { ...page, scope: "page" };
    }
    const matched = matchPageCandidates(buildPageCandidates(), requestedSelectors);
    return {
      ...page,
      scope: "page",
      text: joinCandidateTexts(matched),
      recipe: {
        valid: matched.length === requestedSelectors.length && matched.length > 0,
        matchedSelectors: matched.map((candidate) => candidate.selector)
      }
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
      if ((host === "www.youtube.com" && path === "/watch") || host === "youtu.be") return "youtube";
      if (host === "www.bilibili.com" && path.startsWith("/video/")) return "bilibili-video";
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

  function buildPageCandidates() {
    const nodes = [];
    const seen = new Set();
    const add = (node) => {
      if (!node || node === document.body || seen.has(node) || nodes.length >= 17) return;
      seen.add(node);
      nodes.push(node);
    };
    for (const node of document.querySelectorAll("article,main,[role='main'],[itemprop='articleBody']")) add(node);
    for (const node of document.querySelectorAll("[class],[id]")) {
      if (/(article|content|description|transcript|subtitle|comment|reply|danmaku|barrage|player|feed)/i.test(`${node.id} ${String(node.className || "")}`)) add(node);
      if (nodes.length >= 17) break;
    }
    if (document.body?.innerText?.trim()) nodes.push(document.body);

    return nodes
      .filter((node) => !isExtensionNode(node) && !node.closest(SKIP_SELECTOR) && isVisible(node))
      .map((node) => ({
        node,
        text: normalizeText(node.innerText || node.textContent || ""),
        selector: buildPageCandidateSignature(node)
      }))
      .filter((candidate) => candidate.text)
      .slice(0, 18)
      .map((candidate, index) => ({
        ...candidate,
        id: `c${index + 1}`,
        label: buildPageCandidateLabel(candidate.node),
        preview: candidate.text.slice(0, 280),
        chars: candidate.text.length
      }));
  }

  function toPublicPageCandidate(candidate) {
    return {
      id: candidate.id,
      label: candidate.label,
      preview: candidate.preview,
      chars: candidate.chars,
      selector: candidate.selector
    };
  }

  function buildPageCandidateSignature(node) {
    if (node === document.body) return "caa-page-v1/body";
    const parts = [];
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const siblings = current.parentElement?.children;
      parts.unshift(`${current.tagName.toLowerCase()}:${siblings ? Array.prototype.indexOf.call(siblings, current) : 0}`);
    }
    return `caa-page-v1/${parts.join("/")}`;
  }

  function buildPageCandidateLabel(node) {
    const source = `${node.id} ${String(node.className || "")}`.toLowerCase();
    const kind = [
      ["transcript|subtitle", "字幕/转录"],
      ["description", "描述"],
      ["comment|reply", "评论"],
      ["danmaku|barrage", "弹幕"],
      ["article|content", "正文"],
      ["player", "播放器"],
      ["feed", "信息流"]
    ].find(([pattern]) => new RegExp(pattern).test(source))?.[1] || "页面内容";
    return `${kind} · ${node.tagName.toLowerCase()}`;
  }

  function normalizeRecipeSelectors(selectors) {
    return [...new Set((Array.isArray(selectors) ? selectors : [])
      .map((selector) => String(selector || "").trim())
      .filter(Boolean))].slice(0, 4);
  }

  function matchPageCandidates(candidates, selectors) {
    const wanted = new Set(normalizeRecipeSelectors(selectors));
    return candidates.filter((candidate) => wanted.has(candidate.selector)).slice(0, 4);
  }

  function joinCandidateTexts(candidates) {
    const texts = [];
    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate.text || seen.has(candidate.text)) continue;
      seen.add(candidate.text);
      texts.push(candidate.text);
    }
    return texts.join("\n\n");
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
        if (!event.isTrusted) return;
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "floating-chat") {
          openFloatingChatFromSelection();
          hideToolbar();
          return;
        }
        openFloatingChatFromSelection({
          action: button.dataset.action,
          label: SELECTION_ACTION_LABELS[button.dataset.action]
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
      void sendRuntimeMessage({ type: "RUN_SEARCH_ACTION", query });
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
    launcher.title = "点击打开侧边栏，垂直拖动调整位置";
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
      <button type="button" data-floating-action="screenshot" title="打开侧栏截图问答" aria-label="打开侧栏截图问答">图</button>
    `;
    rail.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      const button = event.target.closest("button[data-floating-action]");
      if (!button) return;
      if (button.dataset.floatingAction === "chat") {
        await openFloatingSessionPicker(button.getBoundingClientRect(), { preferredSide: "left" });
      }
      if (button.dataset.floatingAction === "screenshot") {
        await openScreenshotPanel(button.getBoundingClientRect());
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
      void sendRuntimeMessage({ type: "OPEN_SIDE_PANEL" });
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
      placeDockAt(dock, dockDragStart.top + dy);
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
    const saved = await getLocalStorage(DOCK_STATE_KEY);
    const state = saved[DOCK_STATE_KEY] || {};
    if (Number.isFinite(state.top)) {
      placeDockAt(dock, state.top);
    }
    if (state.edgeHidden) {
      setDockEdgeHidden(dock, true, { persist: false });
    }
  }

  function toggleDockEdge(dock) {
    setDockEdgeHidden(dock, !dock.classList.contains("is-edge-hidden"));
  }

  function setDockEdgeHidden(dock, hidden, options = {}) {
    const rect = dock.getBoundingClientRect();
    if (hidden) {
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
      const top = Number(dock.dataset.visibleTop);
      placeDockAt(dock, Number.isFinite(top) ? top : rect.top);
    }
    if (options.persist !== false) {
      saveDockState(dock, { edgeHidden: hidden });
    }
  }

  function placeDockAt(dock, top) {
    const height = dock.offsetHeight || 104;
    // ponytail: right edge only; add left-edge support when it has its own hide control.
    dock.style.left = "auto";
    dock.style.right = "";
    dock.style.top = `${clamp(top, 8, window.innerHeight - height - 8)}px`;
    dock.style.bottom = "auto";
  }

  function clampDockToViewport(dock) {
    if (dock.classList.contains("is-edge-hidden")) {
      const top = clamp(dock.getBoundingClientRect().top, 8, window.innerHeight - dock.offsetHeight - 8);
      dock.style.top = `${top}px`;
      dock.dataset.visibleTop = String(Math.round(top));
      saveDockState(dock, { edgeHidden: true });
      return;
    }
    const rect = dock.getBoundingClientRect();
    placeDockAt(dock, rect.top);
    saveDockState(dock, { edgeHidden: false });
  }

  function saveDockState(dock, patch = {}) {
    const rect = dock.getBoundingClientRect();
    const visibleTop = Number(dock.dataset.visibleTop);
    const edgeHidden = patch.edgeHidden ?? dock.classList.contains("is-edge-hidden");
    const top = edgeHidden && Number.isFinite(visibleTop) ? visibleTop : rect.top;
    void setLocalStorage({
      [DOCK_STATE_KEY]: {
        top: Math.round(top),
        edgeHidden
      }
    });
  }

  async function openFloatingChatFromSelection(initialAction = null) {
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
    }, rect, null, {}, initialAction);
  }

  async function openScreenshotPanel(anchorRect) {
    const response = await sendRuntimeMessage(
      { type: "OPEN_SIDE_PANEL" },
      { ok: false, error: REFRESH_PAGE_MESSAGE }
    );
    if (!response?.ok) {
      await openFloatingChat({
        type: "page",
        label: "无法打开截图问答",
        title: document.title,
        text: response?.error || "无法打开侧边栏"
      }, anchorRect);
    }
  }

  async function openFloatingSessionPicker(anchorRect, placement = {}) {
    const loaded = await sendRuntimeMessage({
      type: "FLOATING_CHAT_LOAD",
      pageUrl: location.href
    }, { ok: false, sessions: [] });
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

  async function openFloatingChat(source, anchorRect, existingSession = null, placement = {}, initialAction = null) {
    const start = existingSession ? { ok: true, session: existingSession } : await sendRuntimeMessage({
      type: "FLOATING_CHAT_START",
      pageUrl: location.href,
      pageTitle: document.title,
      source: serializeFloatingSource(source)
    }, { ok: false, error: REFRESH_PAGE_MESSAGE });

    const dialog = createFloatingChatDialog(source, start?.session);
    document.documentElement.appendChild(dialog);
    placeFloatingDialog(dialog, anchorRect, placement);
    enableFloatingDialogDrag(dialog);

    if (!start?.ok) {
      addFloatingChatMessage(dialog, "error", start?.error || "无法创建浮窗会话");
      return;
    }
    if (initialAction?.action && initialAction?.label) {
      await sendFloatingChatPrompt(dialog, source, initialAction.label, initialAction.action);
    } else {
      renderFloatingSessionMessages(dialog, start.session);
    }
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

    const form = dialog.querySelector("form");
    const input = dialog.querySelector("textarea");
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || composing || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      form.requestSubmit();
    });
    dialog.querySelector("[data-floating-control='close']").addEventListener("click", () => dialog.remove());
    dialog.querySelector("[data-floating-control='minimize']").addEventListener("click", () => {
      dialog.classList.toggle("is-minimized");
    });
    dialog.querySelector("[data-floating-control='new']").addEventListener("click", () => {
      const rect = dialog.getBoundingClientRect();
      openFloatingChat(source, rect);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = "";
      await sendFloatingChatPrompt(dialog, source, prompt);
    });
    return dialog;
  }

  async function sendFloatingChatPrompt(dialog, source, prompt, selectionAction = "") {
    const sessionId = dialog.dataset.sessionId;
    if (!sessionId) {
      addFloatingChatMessage(dialog, "error", "浮窗会话尚未初始化。");
      return;
    }
    addFloatingChatMessage(dialog, "user", prompt);
    const pending = addFloatingChatMessage(dialog, "assistant", "正在思考...");
    setFloatingChatBusy(dialog, true);
    try {
      const response = await sendRuntimeMessage({
        type: "FLOATING_CHAT_MESSAGE",
        sessionId,
        pageUrl: location.href,
        pageTitle: document.title,
        source: serializeFloatingSource(source),
        prompt,
        selectionAction
      }, { ok: false, error: REFRESH_PAGE_MESSAGE });
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
      void sendRuntimeMessage({ type: "FLOATING_CHAT_COMPRESS", sessionId });
      floatingCompressionTimers.delete(sessionId);
    }, FLOATING_CHAT_IDLE_MS));
  }

  function serializeFloatingSource(source) {
    return {
      type: source.type || "page",
      label: source.label || "",
      title: source.title || document.title,
      text: source.text || ""
    };
  }

  function buildFloatingSourceLabel(source) {
    if (source.type === "screenshot") return "截图 · 当前页面";
    if (source.type === "selection") return "选区 · 当前页面";
    return "网页 · 当前页面";
  }

  function buildFloatingSourcePreview(source) {
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
    void sendRuntimeMessage({ type: "REGION_PICK_STARTED" });
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
      void sendRuntimeMessage({ type: "REGION_PICK_CANCELLED" });
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
    clearSelectedRegionMarker();
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
    void sendRuntimeMessage({ type: "REGION_SELECTED", region: getSelectedRegionSnapshot() });
  }

  function clearSelectedRegion() {
    clearSelectedRegionMarker();
    void sendRuntimeMessage({ type: "REGION_CLEARED" });
  }

  function clearSelectedRegionMarker() {
    if (selectedRegion?.element?.isConnected) {
      selectedRegion.element.classList.remove("custom-ai-assistant-selected-region");
    }
    selectedRegion = null;
    for (const marker of document.querySelectorAll(".custom-ai-assistant-selected-region")) {
      marker.classList.remove("custom-ai-assistant-selected-region");
    }
  }

  function getSelectedRegionSnapshot() {
    recoverSelectedRegion();
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
    recoverSelectedRegion();
    return selectedRegion?.element?.isConnected ? selectedRegion.element : null;
  }

  function recoverSelectedRegion() {
    if (selectedRegion?.element?.isConnected) return;
    selectedRegion = null;
    const markers = [...document.querySelectorAll(".custom-ai-assistant-selected-region")].filter((node) => !isExtensionNode(node));
    const marker = markers.shift();
    for (const orphan of markers) orphan.classList.remove("custom-ai-assistant-selected-region");
    if (!marker) return;
    const text = normalizeText(marker.innerText || marker.textContent || "");
    if (!text) {
      marker.classList.remove("custom-ai-assistant-selected-region");
      return;
    }
    selectedRegion = {
      id: ensureElementId(marker),
      element: marker,
      label: buildElementLabel(marker),
      text
    };
  }

  function collectTranslatableBlocks(limit, recipeSelectors = []) {
    const roots = getTranslationRoots(recipeSelectors);
    if (!roots.length) return [];
    let nodes = collectTranslationNodes(roots, TRANSLATABLE_SELECTOR);
    if (!nodes.some(isTranslatableNode)) {
      nodes = collectTranslationNodes(roots, `${TRANSLATABLE_SELECTOR},${TRANSLATION_FALLBACK_SELECTOR}`);
    }

    const seen = new Set();
    const blocks = [];
    for (const node of nodes) {
      if (blocks.length >= limit) break;
      if (!isTranslatableNode(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      const key = text;
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

  function collectTranslationNodes(roots, selector) {
    const nodes = [];
    for (const root of roots) {
      if (root.matches?.(selector)) nodes.push(root);
      nodes.push(...root.querySelectorAll(selector));
    }
    return nodes;
  }

  function getTranslationRoots(recipeSelectors) {
    const selectedRoot = getContextRoot();
    if (selectedRoot) return [selectedRoot];
    const selectors = normalizeRecipeSelectors(recipeSelectors);
    if (!selectors.length) return [getReadableRoot()].filter(Boolean);
    return matchPageCandidates(buildPageCandidates(), selectors).map((candidate) => candidate.node);
  }

  function isTranslatableNode(node) {
    if (!node || isExtensionNode(node) || node.closest(SKIP_SELECTOR)) return false;
    if (!isVisible(node)) return false;
    const text = normalizeText(node.innerText || node.textContent || "");
    if (text.length < 8 || text.length > 1800) return false;
    if (/^[\d\s.,:;!?()[\]{}'"“”‘’\-_/\\|]+$/.test(text)) return false;
    return !hasMeaningfulTranslationChild(node);
  }

  function hasMeaningfulTranslationChild(node) {
    for (const child of node.querySelectorAll(`${TRANSLATABLE_SELECTOR},${TRANSLATION_FALLBACK_SELECTOR}`)) {
      if (child === node || child.closest(".custom-ai-assistant-inline-translation")) continue;
      const text = normalizeText(child.innerText || child.textContent || "");
      if (text.length >= 8 && text.length <= 1800 && !/^[\d\s.,:;!?()[\]{}'"“”‘’\-_/\\|]+$/.test(text)) return true;
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
    return Boolean(node?.closest?.(EXTENSION_UI_SELECTOR));
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
