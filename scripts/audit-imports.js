import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const errors = [];

for (const file of listJavaScriptFiles(srcDir)) {
  const source = fs.readFileSync(file, "utf8");
  const imports = [...source.matchAll(/import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g)];
  for (const match of imports) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), specifier);
    if (!moduleExists(resolved)) {
      errors.push(`${path.relative(root, file)} imports missing module ${specifier}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Import audit passed.");

function listJavaScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function moduleExists(resolved) {
  return fs.existsSync(resolved) ||
    fs.existsSync(`${resolved}.js`) ||
    fs.existsSync(path.join(resolved, "index.js"));
}
