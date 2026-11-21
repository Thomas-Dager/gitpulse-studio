import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type { SecretFinding } from "@/types";

const MAX_SCAN_FILE_BYTES = 512 * 1024; // 512 KB

const SAFE_ENV_FILENAMES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  ".dart_tool",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".db",
  ".sqlite",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wav",
]);

interface SecretPattern {
  type: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { type: "Google / Gemini API Key", regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { type: "OpenAI API Key", regex: /sk-(?:proj-)?[A-Za-z0-9\-_]{24,}/g },
  { type: "GitHub Personal Token", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { type: "GitHub Fine-Grained Token", regex: /github_pat_[A-Za-z0-9_]{22,}/g },
  { type: "AWS Access Key ID", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "Private Key Block", regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
  { type: "Stripe Live Secret Key", regex: /sk_live_[0-9a-zA-Z]{16,}/g },
  { type: "Slack Token", regex: /xox[baprs]-[0-9a-zA-Z-]{12,}/g },
];

function obfuscateSecret(value: string): string {
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isEnvFile(relPath: string): boolean {
  const base = path.basename(relPath).toLowerCase();
  if (SAFE_ENV_FILENAMES.has(base)) return false;
  return base === ".env" || base.startsWith(".env.");
}

function shouldSkipPath(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const ext = path.extname(relPath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export async function untrackCachedEnvFiles(git: SimpleGit): Promise<string[]> {
  const untracked: string[] = [];
  try {
    const raw = await git.raw(["ls-files"]);
    const trackedFiles = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const file of trackedFiles) {
      if (isEnvFile(file)) {
        await git.rmKeepLocal(file);
        untracked.push(file);
      }
    }
  } catch {
    // Si aún no hay HEAD o índice vacío, ignorar
  }
  return untracked;
}

export function scanFilesForSecrets(
  projectPath: string,
  relativeFiles: string[]
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const relPath of relativeFiles) {
    const cleanRel = relPath.trim();
    if (!cleanRel) continue;

    if (isEnvFile(cleanRel)) {
      findings.push({
        file: cleanRel,
        line: 1,
        type: "Archivo .env expuesto",
        snippet: path.basename(cleanRel),
      });
      continue;
    }

    if (shouldSkipPath(cleanRel)) continue;

    const fullPath = path.join(projectPath, cleanRel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (!stat.isFile() || stat.size > MAX_SCAN_FILE_BYTES) continue;

    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      if (!lineText || lineText.length > 2000) continue;

      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(lineText);
        if (match) {
          const matchedText = match[0];
          const lowerLine = lineText.toLowerCase();
          // Evitar falsos positivos en ejemplos o placeholders obvios
          if (
            lowerLine.includes("your_") ||
            lowerLine.includes("example") ||
            lowerLine.includes("placeholder") ||
            matchedText.includes("XXXX")
          ) {
            continue;
          }
          findings.push({
            file: cleanRel,
            line: idx + 1,
            type: pattern.type,
            snippet: obfuscateSecret(matchedText),
          });
        }
      }
    }
  }

  return findings;
}
