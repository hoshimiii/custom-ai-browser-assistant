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

if (!contentSource.includes("if (!event.isTrusted) return;")) {
  errors.push("Injected quick actions must reject synthetic clicks");
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

if (!manifest.commands?.["open-assistant"] || !manifest.commands?.["summarize-page"]) {
  errors.push("Missing expected keyboard commands");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Extension manifest check passed.");
