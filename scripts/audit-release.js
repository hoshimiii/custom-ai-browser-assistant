import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dist = path.join(root, "dist");
const zipPath = path.join(root, "releases", "custom-ai-browser-assistant.zip");

const requiredDistFiles = [
  "manifest.json",
  "src/background.js",
  "src/sidepanel/sidepanel.html",
  "src/options/options.html",
  "src/content/contentScript.js",
  "assets/icon-128.png"
];

const requiredSourceFiles = [
  ".github/workflows/ci.yml",
  "docs/IMPLEMENTATION_PLAN.md",
  "docs/GITHUB_SETUP.md",
  "docs/CUSTOMER_FEEDBACK.md",
  "docs/PRIVACY.md",
  "src/shared/apiClient.js",
  "src/shared/actions.js",
  "src/shared/backup.js",
  "src/shared/chunking.js",
  "src/shared/floatingMemory.js",
  "src/shared/library.js",
  "src/shared/pageTypes.js",
  "src/shared/translation.js",
  "src/shared/vision.js"
];

const errors = [];

for (const file of requiredDistFiles) {
  assertExists(path.join(dist, file), `dist is missing ${file}`);
}

for (const file of requiredSourceFiles) {
  assertExists(path.join(root, file), `source is missing ${file}`);
}

assertExists(zipPath, "release zip is missing");

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  errors.push("release manifest is not MV3");
}
if (!manifest.side_panel?.default_path) {
  errors.push("release manifest is missing side panel");
}
if (!manifest.options_page) {
  errors.push("release manifest is missing options page");
}

const zipListing = listZipEntries(zipPath);
for (const file of requiredDistFiles) {
  const normalized = file.replaceAll("\\", "/");
  if (!zipListing.some((entry) => entry.endsWith(normalized))) {
    errors.push(`zip is missing ${normalized}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Release audit passed.");

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    errors.push(message);
  }
}

function listZipEntries(filePath) {
  const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${filePath.replaceAll("'", "''")}').Entries | ForEach-Object { $_.FullName }`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    errors.push("failed to inspect release zip");
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
