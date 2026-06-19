import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

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
  "src/shared/library.js",
  "src/shared/pageTypes.js",
  "src/shared/providers.js",
  "src/shared/translation.js",
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

if (!manifest.commands?.["open-assistant"] || !manifest.commands?.["summarize-page"]) {
  errors.push("Missing expected keyboard commands");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Extension manifest check passed.");
