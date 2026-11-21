import fs from "node:fs";
import path from "node:path";
import type { DetectedStack } from "@/types";

export function detectProjectStack(projectPath: string): DetectedStack {
  try {
    const entries = new Set(fs.readdirSync(projectPath));

    if (
      entries.has("next.config.ts") ||
      entries.has("next.config.mjs") ||
      entries.has("next.config.js")
    ) {
      return "nextjs";
    }

    if (entries.has("package.json")) {
      try {
        const pkgRaw = fs.readFileSync(path.join(projectPath, "package.json"), "utf8");
        const pkg = JSON.parse(pkgRaw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        if (pkg.dependencies?.next || pkg.devDependencies?.next) {
          return "nextjs";
        }
      } catch {
        // Ignorar JSON malformado
      }
      return "node";
    }

    if (
      entries.has("requirements.txt") ||
      entries.has("pyproject.toml") ||
      entries.has("Pipfile") ||
      entries.has("main.py") ||
      entries.has("app.py")
    ) {
      return "python";
    }

    if (entries.has("pubspec.yaml")) {
      return "flutter";
    }

    if (entries.has("Cargo.toml")) {
      return "rust";
    }

    if (entries.has("index.html")) {
      return "static";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

const UNIVERSAL_IGNORES = [
  ".env",
  ".env.local",
  ".env.*.local",
  "!.env.example",
  ".DS_Store",
  "Thumbs.db",
  "*.log",
  "*.db",
  "*.db-journal",
  "*.db-wal",
  "*.db-shm",
  "*.sqlite",
];

const STACK_IGNORES: Record<DetectedStack, string[]> = {
  nextjs: ["node_modules/", ".next/", "out/", "dist/", "build/", "*.tsbuildinfo", "next-env.d.ts"],
  node: ["node_modules/", "dist/", "build/", "coverage/", "*.tsbuildinfo"],
  python: [".venv/", "venv/", "env/", "__pycache__/", "*.pyc", "*.pyo", ".pytest_cache/", "dist/", "build/"],
  flutter: [".dart_tool/", ".packages", "build/", ".flutter-plugins", ".flutter-plugins-dependencies"],
  rust: ["target/", "**/*.rs.bk"],
  static: ["dist/", ".cache/"],
  unknown: ["node_modules/", ".venv/", "dist/", "build/"],
};

export function ensureSmartGitignore(projectPath: string): {
  stack: DetectedStack;
  updated: boolean;
  rulesAdded: string[];
} {
  const stack = detectProjectStack(projectPath);
  const gitignorePath = path.join(projectPath, ".gitignore");

  let existingContent = "";
  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, "utf8");
  }

  const existingLines = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  );

  // Normalizar comprobación con y sin barra final para carpetas comunes
  const hasRule = (rule: string): boolean => {
    if (existingLines.has(rule)) return true;
    const withoutSlash = rule.replace(/\/$/, "");
    return existingLines.has(withoutSlash) || existingLines.has(`${withoutSlash}/`);
  };

  const requiredRules = [...UNIVERSAL_IGNORES, ...(STACK_IGNORES[stack] || [])];
  const rulesAdded = requiredRules.filter((rule) => !hasRule(rule));

  if (rulesAdded.length > 0) {
    const header = existingContent.trim()
      ? "\n\n# Agregado automáticamente por GitPulse Studio\n"
      : "# Generado automáticamente por GitPulse Studio\n";
    const block = `${header}${rulesAdded.join("\n")}\n`;
    fs.writeFileSync(gitignorePath, `${existingContent.trimEnd()}${block}`, "utf8");
  }

  return {
    stack,
    updated: rulesAdded.length > 0,
    rulesAdded,
  };
}
