import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const backgroundSource = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src/content/contentScript.js"), "utf8");
const composerSource = fs.readFileSync(path.join(root, "src/content/floatingComposer.js"), "utf8");
const sidePanelSource = fs.readFileSync(path.join(root, "src/sidepanel/sidepanel.js"), "utf8");
const sidePanelMarkup = fs.readFileSync(path.join(root, "src/sidepanel/sidepanel.html"), "utf8");
const pageAgentSource = fs.readFileSync(path.join(root, "src/shared/pageAgent.js"), "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  return startIndex < 0 || endIndex < 0 ? "" : source.slice(startIndex, endIndex);
}

const required = [
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "src/background.js",
  "src/content/contentScript.js",
  "src/content/floatingComposer.html",
  "src/content/floatingComposer.js",
  "src/sidepanel/sidepanel.html",
  "src/options/options.html",
  "src/shared/actions.js",
  "src/shared/backup.js",
  "src/shared/chunking.js",
  "src/shared/floatingMemory.js",
  "src/shared/library.js",
  "src/shared/modelInstances.js",
  "src/shared/pageAgent.js",
  "src/shared/pageRecipes.js",
  "src/shared/pageTypes.js",
  "src/shared/providers.js",
  "src/shared/translation.js",
  "src/shared/tts.js",
  "src/shared/vision.js"
];

const errors = [];

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3");
}

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`Missing ${file}`);
  }
}

for (const permission of ["activeTab", "storage", "sidePanel", "tabs"]) {
  if (!manifest.permissions.includes(permission)) {
    errors.push(`Missing permission ${permission}`);
  }
}

if (manifest.host_permissions?.length !== 1 || manifest.host_permissions[0] !== "<all_urls>") {
  errors.push("host_permissions must be exactly [<all_urls>] for captureVisibleTab");
}

if (backgroundSource.includes("captureVisibleTab") || contentSource.includes("captureVisibleTab") || contentSource.includes("CAPTURE_VISIBLE_TAB")) {
  errors.push("Visible-tab capture must remain inside the side panel extension page");
}

if (!sidePanelSource.includes('from "../shared/pageAgent.js"') || !sidePanelSource.includes("buildPageAgentPrompt") || !sidePanelSource.includes("buildPageCodeQuestionPrompt") || !sidePanelSource.includes("parsePageAgentResponse")) {
  errors.push("Side panel must import the page-agent prompt builders and parser");
}

for (const id of ["pageCodeTag", "pageActionTag", "pageTaskPanel", "pageTaskDialog", "confirmPageTask"]) {
  if (!sidePanelMarkup.includes(`id="${id}"`)) errors.push(`Missing page-agent markup: ${id}`);
}
if (!sidePanelMarkup.includes(">确认并启动后台任务<")) {
  errors.push("Background task confirmation text must remain explicit");
}

const imeSafeEnter = ["compositionstart", "compositionend", "isComposing", "keyCode === 229", "event.shiftKey"];
for (const [name, source] of [["side-panel composer", sidePanelSource], ["floating composer", composerSource]]) {
  for (const token of imeSafeEnter) {
    if (!source.includes(token)) errors.push(`${name} must keep IME-safe Enter handling (${token})`);
  }
}

for (const type of ["EXTRACT_PAGE_CODE", "PREVIEW_PAGE_ACTIONS", "EXECUTE_PAGE_ACTIONS"]) {
  if (!contentSource.includes(`message?.type === "${type}"`)) errors.push(`Content script must expose ${type}`);
}
for (const token of ["PAGE_TASK_DOCUMENT_READY", "PAGE_TASK_TICK", "PAGE_TASK_RESULT", "documentToken: pageTaskDocumentToken", "validateLocalPageTask(tick.task)"]) {
  if (!contentSource.includes(token)) errors.push(`Content page-task lifecycle must include ${token}`);
}

const snapshotSanitizerSource = sourceBetween(contentSource, "function sanitizePageCodeClone(", "function isSnapshotExcludedNode(");
if (!["node.matches(\"[contenteditable]\")", "node.textContent = \"\"", "node.removeAttribute(\"value\")"].every((token) => snapshotSanitizerSource.includes(token))) {
  errors.push("Page-code snapshots must blank contenteditable content");
}
const safeSnapshotAttributeSource = sourceBetween(contentSource, "function isSafeSnapshotAttribute(", "function safeSnapshotUrl(");
if (!safeSnapshotAttributeSource.includes("/^data-(testid|test|role)$/.test(name)") || safeSnapshotAttributeSource.includes("data-state")) {
  errors.push("Page-code snapshots must retain only testid/test/role data attributes");
}

const promptUrlSanitizerSource = sourceBetween(pageAgentSource, "function safePromptUrl(", "function enumValue(");
if ((pageAgentSource.match(/safePromptUrl\(url\)/g) || []).length !== 2 || !["url.username = \"\"", "url.password = \"\"", "url.search = \"\"", "url.hash = \"\""].every((token) => promptUrlSanitizerSource.includes(token))) {
  errors.push("Page-agent prompts must strip URL credentials, query, and fragment");
}

const parsePageAgentSource = sourceBetween(pageAgentSource, "export function parsePageAgentResponse(", "export function normalizeBackgroundTask(");
const normalizeBackgroundTaskSource = sourceBetween(pageAgentSource, "export function normalizeBackgroundTask(", "export function classifyTaskDocument(");
const rejectBackgroundSideEffectsSource = sourceBetween(pageAgentSource, "function rejectBackgroundSideEffects(", "function normalizeAction(");
const contentActionValidatorSource = sourceBetween(contentSource, "function validatePageActionRequest(", "function resolvePageTaskRoot(");
const contentTaskValidatorSource = sourceBetween(contentSource, "function validateLocalPageTask(", "function normalizePageTaskLocation(");
const contentBackgroundActionSource = sourceBetween(contentSource, "function assertBackgroundActionAllowed(", "function pageActionRisk(");
if (!parsePageAgentSource.includes("rejectBackgroundSideEffects(actions)") || !normalizeBackgroundTaskSource.includes("rejectBackgroundSideEffects(task.actions)") || !rejectBackgroundSideEffectsSource.includes('type === "click" || type === "setValue"') || !rejectBackgroundSideEffectsSource.includes("fail(") || !contentActionValidatorSource.includes('mode === "background"') || !contentActionValidatorSource.includes("actions.forEach(assertBackgroundActionAllowed)") || !contentTaskValidatorSource.includes("normalized.actions.forEach(assertBackgroundActionAllowed)") || !contentBackgroundActionSource.includes('action.type === "click" || action.type === "setValue"') || !contentBackgroundActionSource.includes("throw new TypeError(")) {
  errors.push("Background click and setValue actions must be rejected by shared and content-script validation");
}

const normalizePageTaskLocationSource = sourceBetween(contentSource, "function normalizePageTaskLocation(", "function installLocalPageTask(");
if (!normalizePageTaskLocationSource.includes("url.href !== location.href")) errors.push("Local page tasks must stay pinned to the exact current URL");

const sidePanelAgentRequestSource = sourceBetween(sidePanelSource, "async function runPageAgentRequest(", "async function persistPageAgentExchange(");
const sidePanelExecuteSource = sourceBetween(sidePanelSource, "async function executePageActionPlan(", "function openPageTaskDialog(");
const contentTargetVerificationSource = sourceBetween(contentSource, 'message?.type === "VERIFY_PAGE_TASK_TARGET"', 'message?.type === "START_PAGE_TASK"');
const backgroundCreateSource = sourceBetween(backgroundSource, "async function createPageAgentTask(", "async function stopPageAgentTask(");
if (!sidePanelAgentRequestSource.includes('type: "PREVIEW_PAGE_ACTIONS", url: target.url') || !sidePanelExecuteSource.includes('type: "EXECUTE_PAGE_ACTIONS", url: target.url') || !contentTargetVerificationSource.includes("message.url === location.href") || !backgroundCreateSource.includes("new URL(tab.url).href !== targetUrl.href") || !backgroundCreateSource.includes('type: "VERIFY_PAGE_TASK_TARGET", url: targetUrl.href') || !backgroundCreateSource.includes("url: targetUrl.href")) {
  errors.push("Page-agent preview, execution, verification, and task creation must preserve the exact URL");
}

const classifyTaskDocumentSource = sourceBetween(pageAgentSource, "export function classifyTaskDocument(", "function normalizeActions(");
if (!classifyTaskDocumentSource.includes('task.scope === "document"') || !classifyTaskDocumentSource.includes("target.href === task.url") || !classifyTaskDocumentSource.includes("documentToken === task.documentToken")) {
  errors.push("Document-scoped tasks must expire when the exact URL or document token changes");
}

const findPageActionTargetSource = sourceBetween(contentSource, "function findPageActionTarget(", "function executePageAction(");
const isExtensionNodeSource = sourceBetween(contentSource, "function isExtensionNode(", "function isVisible(");
if (!findPageActionTargetSource.includes("target === document.documentElement") || !findPageActionTargetSource.includes("target === document.body") || !findPageActionTargetSource.includes("isExtensionNode(target)") || !findPageActionTargetSource.includes("target.querySelector(EXTENSION_UI_SELECTOR)") || !isExtensionNodeSource.includes("closest?.(EXTENSION_UI_SELECTOR)")) {
  errors.push("Page actions must reject html/body and targets inside or containing extension UI");
}

if (!backgroundSource.includes('const PAGE_AGENT_TASKS_KEY = "pageAgentTasks"') || !backgroundSource.includes("chrome.storage.session.get(PAGE_AGENT_TASKS_KEY)") || !backgroundSource.includes("chrome.storage.session.set({ [PAGE_AGENT_TASKS_KEY]: tasks })")) {
  errors.push("Background page tasks must use chrome.storage.session");
}
const tickHandlerStart = backgroundSource.indexOf("async function handlePageTaskTick(");
const tickHandlerEnd = backgroundSource.indexOf("async function handlePageTaskResult(", tickHandlerStart);
const tickHandler = tickHandlerStart < 0 || tickHandlerEnd < 0 ? "" : backgroundSource.slice(tickHandlerStart, tickHandlerEnd);
if (!tickHandler.includes("getPageAgentTasks()") || !tickHandler.includes("isCurrentPageTask(task, message, page)")) {
  errors.push("Every page-task tick must validate the stored task and sender identity");
}
const removeTasksStart = backgroundSource.indexOf("async function removePageAgentTasks(");
const removeTasksEnd = backgroundSource.indexOf("async function updatePageAgentBadge(", removeTasksStart);
const removeTasksSource = removeTasksStart < 0 || removeTasksEnd < 0 ? "" : backgroundSource.slice(removeTasksStart, removeTasksEnd);
const stopTaskStart = backgroundSource.indexOf("async function stopPageAgentTask(");
const stopTaskEnd = backgroundSource.indexOf("async function stopPageAgentTasksForTab(", stopTaskStart);
const stopTaskSource = stopTaskStart < 0 || stopTaskEnd < 0 ? "" : backgroundSource.slice(stopTaskStart, stopTaskEnd);
const stopTabTaskStart = stopTaskEnd;
const stopTabTaskEnd = backgroundSource.indexOf("async function sendPageTaskStop(", stopTabTaskStart);
const stopTabTaskSource = stopTabTaskStart < 0 || stopTabTaskEnd < 0 ? "" : backgroundSource.slice(stopTabTaskStart, stopTabTaskEnd);
if (![stopTaskSource, stopTabTaskSource].every((source) => source.includes("removePageAgentTasks") && source.includes("sendPageTaskStop")) || !removeTasksSource.includes("await savePageAgentTasks")) {
  errors.push("Stopping a page task must remove session state before best-effort STOP delivery");
}
if (pageAgentSource.includes("storage.local") || backgroundSource.includes("storage.local")) {
  errors.push("Page-task definitions must not use chrome.storage.local");
}

const sourceFiles = [];
function collectJavaScriptSources(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScriptSources(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) sourceFiles.push(fullPath);
  }
}
collectJavaScriptSources(path.join(root, "src"));
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/\beval\s*\(|\bnew\s+Function\b|chrome\.debugger\b/.test(source)) errors.push(`Unsafe dynamic page execution in ${path.relative(root, file)}`);
}

const unsafeContentChromeCalls = contentSource.match(/chrome\.(?:runtime\.sendMessage|storage\.local\.(?:get|set))\(/g) || [];
if (unsafeContentChromeCalls.length !== 3 || !contentSource.includes("function sendRuntimeMessage(") || !contentSource.includes("function getLocalStorage(") || !contentSource.includes("function setLocalStorage(")) {
  errors.push("Content-script runtime and storage calls must use the invalidation-safe helpers");
}

const selectionToolbarHandler = contentSource.match(/toolbar\.addEventListener\("click", \(event\) => \{([\s\S]*?)\n\s*\}\);/);
if (!selectionToolbarHandler?.[1].includes("if (!event.isTrusted) return;")) {
  errors.push("Selection toolbar must reject synthetic clicks before acting on buttons");
}

if (!selectionToolbarHandler?.[1].includes("openFloatingChatFromSelection({") || !contentSource.includes("selectionAction")) {
  errors.push("Selection toolbar actions must start floating-chat requests");
}

if (!backgroundSource.includes("buildSelectionPrompt(selectionAction, selectionText, currentSettings)")) {
  errors.push("Floating selection actions must use the current selection prompt settings");
}

const floatingMessageHandler = backgroundSource.match(/async function handleFloatingChatMessage\(message, sender\) \{([\s\S]*?)\n\}/);
const floatingHandlerSource = floatingMessageHandler?.[1] || "";
if (floatingHandlerSource.indexOf("Unknown selection action") > floatingHandlerSource.indexOf("requestChat(") || floatingHandlerSource.indexOf("Unknown selection action") < 0) {
  errors.push("Floating chat must validate unknown selection actions before provider use");
}
const buildMessageIndex = floatingHandlerSource.indexOf("buildFloatingUserMessage(");
const userAppendIndex = floatingHandlerSource.indexOf('appendFloatingMessage(session, { role: "user"');
const firstSaveIndex = floatingHandlerSource.indexOf("await saveFloatingSession(session);");
const requestChatIndex = floatingHandlerSource.indexOf("requestChat(");
if (buildMessageIndex < 0 || userAppendIndex < 0 || firstSaveIndex < 0 || requestChatIndex < 0 || buildMessageIndex > userAppendIndex || userAppendIndex > firstSaveIndex || firstSaveIndex > requestChatIndex) {
  errors.push("Floating chat must build from the prior session, then save the user turn before provider use");
}

if (!sidePanelSource.includes("chrome.tabs.captureVisibleTab")) {
  errors.push("Missing side-panel visible-tab capture");
}

if (/from\s+["']\.\.\/shared\/pageRecipes\.js["']/.test(sidePanelSource) || /\bresolvePageRecipe\s*\(/.test(sidePanelSource) || sidePanelSource.includes("recipeSelectors")) {
  errors.push("Side panel page operations must not use the page planner");
}

if (sidePanelSource.includes("本次将按普通聊天发送")) {
  errors.push("Page-read failures must not downgrade to ordinary chat");
}

if (!sidePanelSource.includes("linkifyVideoTimestamps(fullText, videoTimestampUrl)") || !sidePanelSource.includes("parseVideoTimestampLink(`${anchor.textContent}(${anchor.href})`)") || !sidePanelSource.includes("handleVideoTimestampClick") || !sidePanelSource.includes("chrome.scripting.executeScript") || !sidePanelSource.includes("video.currentTime = seconds")) {
  errors.push("Timed video summaries must persist timestamp links and seek with a bounded main-world script");
}

const renderHistorySource = sidePanelSource.match(/async function renderHistory\(\) \{([\s\S]*?)\r?\n\}\r?\n\r?\nfunction showFloatingHistory/);
const floatingHistoryHandler = renderHistorySource?.[1].match(/button\.addEventListener\("click", \(\) => \{([\s\S]*?)\r?\n\s*\}\);/);
const floatingHistorySource = floatingHistoryHandler?.[1] || "";
if (floatingHistorySource.indexOf("showFloatingHistory(conversation);") < 0 || floatingHistorySource.indexOf("return;") < floatingHistorySource.indexOf("showFloatingHistory(conversation);") || floatingHistorySource.indexOf("return;") > floatingHistorySource.indexOf("state.messages = conversation.messages")) {
  errors.push("Floating history clicks must return before ordinary conversation state assignment");
}

if (!manifest.commands?.["open-assistant"] || !manifest.commands?.["summarize-page"]) {
  errors.push("Missing expected keyboard commands");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Extension manifest check passed.");
