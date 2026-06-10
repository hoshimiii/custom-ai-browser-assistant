import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const include = ["manifest.json", "src", "assets", "README.md"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const item of include) {
  copyRecursive(path.join(root, item), path.join(dist, item));
}

console.log(`Built extension at ${dist}`);

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyRecursive(path.join(source, child), path.join(target, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
