import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dist = path.join(root, "dist");
const releases = path.join(root, "releases");
const zipPath = path.join(releases, "custom-ai-browser-assistant.zip");

if (!fs.existsSync(dist)) {
  console.error("Missing dist directory. Run npm run build first.");
  process.exit(1);
}

fs.mkdirSync(releases, { recursive: true });
fs.rmSync(zipPath, { force: true });

const command = [
  "Compress-Archive",
  "-Path",
  path.join(dist, "*"),
  "-DestinationPath",
  zipPath,
  "-Force"
].join(" ");

const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
  cwd: root,
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

if (!fs.existsSync(zipPath)) {
  console.error(`Packaging failed: ${zipPath} was not created.`);
  process.exit(1);
}

console.log(`Packaged extension at ${zipPath}`);
