import fs from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".cache", "dist", "build",
  ".next", ".turbo", ".shopify", "coverage", ".vite",
  ".idea", ".vscode",
]);

const IGNORE_FILES = new Set([
  ".DS_Store", "package-lock.json", "pnpm-lock.yaml",
  "yarn.lock", "code.txt", ".env", ".env.local", ".env.example",
  "dump-code.js", "getCode.js",
]);

const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".json", ".toml", ".yml", ".yaml",
  ".css", ".scss", ".sass", ".less",
  ".html", ".liquid", ".md", ".txt",
  ".prisma", ".graphql", ".gql",
]);

const SPECIAL = new Set([
  ".env", ".env.local", ".env.example",
  ".gitignore", ".eslintrc", ".prettierrc", ".npmrc",
]);

const argv = process.argv.slice(2);
const rootArg = argv.find((a) => !a.startsWith("--"));
const rootDir = path.resolve(rootArg || process.cwd());

const outIdx = argv.indexOf("--out");
const outFile = path.resolve(outIdx !== -1 ? argv[outIdx + 1] : "code.txt");

const isText = (file) => {
  const base = path.basename(file);
  if (SPECIAL.has(base)) return true;
  return TEXT_EXT.has(path.extname(file).toLowerCase());
};

function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;
    if (entry.isFile() && IGNORE_FILES.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, files);
    } else if (isText(full)) {
      files.push(full);
    }
  }
  return files;
}

function buildTree(dir, prefix = "", out = [], rootDir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const visible = entries.filter((e) => {
    if (e.isDirectory() && IGNORE_DIRS.has(e.name)) return false;
    if (e.isFile() && IGNORE_FILES.has(e.name)) return false;
    return true;
  });

  visible.forEach((entry, i) => {
    const isLast = i === visible.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(`${prefix}${branch}${entry.name}/`);
      buildTree(full, childPrefix, out, rootDir);
    } else {
      out.push(`${prefix}${branch}${entry.name}`);
    }
  });

  return out;
}

try {
  const lines = [];

  lines.push("# ============================================================");
  lines.push(`# Project root : ${rootDir}`);
  lines.push(`# Generated at : ${new Date().toISOString()}`);
  lines.push("# ============================================================");
  lines.push("");

  lines.push("# ------------------------------------------------------------");
  lines.push("# FILE TREE");
  lines.push("# ------------------------------------------------------------");
  lines.push(`${path.basename(rootDir)}/`);
  lines.push(...buildTree(rootDir, "", [], rootDir));
  lines.push("");

  const files = collectFiles(rootDir);

  lines.push("# ------------------------------------------------------------");
  lines.push(`# FILE CONTENTS (${files.length} files)`);
  lines.push("# ------------------------------------------------------------");
  lines.push("");

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const ext = path.extname(file).toLowerCase().replace(".", "") || "text";

    lines.push("=".repeat(70));
    lines.push(`FILE: ${rel}`);
    lines.push("=".repeat(70));
    lines.push("");

    try {
      const content = fs.readFileSync(file, "utf8");
      lines.push(content.replace(/\s+$/, ""));
      lines.push("");
    } catch (err) {
      lines.push(`[unreadable: ${err.message}]`);
      lines.push("");
    }
  }

  const output = lines.join("\n");
  fs.writeFileSync(outFile, output, "utf8");

  console.log(`✅ Wrote ${outFile}`);
  console.log(`   Root      : ${rootDir}`);
  console.log(`   Files     : ${files.length}`);
  console.log(`   Size      : ${(output.length / 1024).toFixed(1)} KB`);
  console.log(`   Lines     : ${output.split("\n").length}`);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}