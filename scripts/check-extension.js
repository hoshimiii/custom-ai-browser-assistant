import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const backgroundSource = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src/content/contentScript.js"), "utf8");
const sidePanelSource = fs.readFileSync(path.join(root, "src/sidepanel/sidepanel.js"), "utf8");

const required = [
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "src/background.js",
  "src/content/contentScript.js",
  "src/sidepanel/sidepanel.html",
  "src/options/options.html",
  "src/shared/actions.js",
  "src/shared/backup.js",
  "src/shared/chunking.js",
  "src/shared/floatingMemory.js",
  "src/shared/library.js",
  "src/shared/modelInstances.js",
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
