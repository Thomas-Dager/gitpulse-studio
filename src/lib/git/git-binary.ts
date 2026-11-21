import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

let cachedGitBinary: string | null = null;

function fileExists(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

export function resolveGitBinary(forceRefresh = false): string {
  if (cachedGitBinary && !forceRefresh && fileExists(cachedGitBinary)) {
    return cachedGitBinary;
  }

  // 1. Variable de entorno explícita
  const envPath = process.env.GIT_BINARY_PATH?.trim();
  if (envPath && fileExists(envPath)) {
    cachedGitBinary = envPath;
    return cachedGitBinary;
  }

  // 2. Buscar en PATH del sistema
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const result = execFileSync(cmd, ["git"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const firstLine = result.split(/\r?\n/)[0]?.trim();
    if (firstLine && fileExists(firstLine)) {
      cachedGitBinary = firstLine;
      return cachedGitBinary;
    }
  } catch {
    // Continuar con ubicaciones conocidas
  }

  // 3. Rutas estándar de Git en Windows
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const standardCandidates = [
    path.join(programFiles, "Git", "cmd", "git.exe"),
    path.join(programFiles, "Git", "bin", "git.exe"),
    path.join(programFilesX86, "Git", "cmd", "git.exe"),
    localAppData ? path.join(localAppData, "Programs", "Git", "cmd", "git.exe") : "",
  ].filter(Boolean);

  for (const candidate of standardCandidates) {
    if (fileExists(candidate)) {
      cachedGitBinary = candidate;
      return cachedGitBinary;
    }
  }

  // 4. Autodescubrimiento dentro de GitHub Desktop (ej. app-3.6.6\resources\app\git\cmd\git.exe)
  if (localAppData) {
    const ghDesktopRoot = path.join(localAppData, "GitHubDesktop");
    if (fs.existsSync(ghDesktopRoot)) {
      try {
        const entries = fs
          .readdirSync(ghDesktopRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name.startsWith("app-"))
          .map((d) => d.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

        for (const appDir of entries) {
          const candidate = path.join(
            ghDesktopRoot,
            appDir,
            "resources",
            "app",
            "git",
            "cmd",
            "git.exe"
          );
          if (fileExists(candidate)) {
            cachedGitBinary = candidate;
            return cachedGitBinary;
          }
        }
      } catch {
        // Ignorar errores de lectura de directorio
      }
    }
  }

  throw new Error(
    "No se encontró el ejecutable de git (git.exe). Instala Git para Windows o GitHub Desktop, o configura GIT_BINARY_PATH en .env."
  );
}

export function tryResolveGitBinary(): string | null {
  try {
    return resolveGitBinary();
  } catch {
    return null;
  }
}

const BLOCKED_SIMPLE_GIT_ENV_KEYS = new Set([
  "editor",
  "git_askpass",
  "git_config_global",
  "git_config_system",
  "git_config_count",
  "git_config",
  "git_editor",
  "git_exec_path",
  "git_external_diff",
  "git_pager",
  "git_proxy_command",
  "git_template_dir",
  "git_sequence_editor",
  "git_ssh",
  "git_ssh_command",
  "pager",
  "prefix",
  "ssh_askpass",
]);

function buildSafeGitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (val === undefined) continue;
    if (BLOCKED_SIMPLE_GIT_ENV_KEYS.has(key.toLowerCase())) continue;
    env[key] = val;
  }
  env.GIT_TERMINAL_PROMPT = "0";
  env.GCM_INTERACTIVE = "never";
  return env;
}

export function createGitInstance(baseDir: string): SimpleGit {
  const binary = resolveGitBinary();
  return simpleGit({
    baseDir,
    binary,
    trimmed: true,
    maxConcurrentProcesses: 4,
  }).env(buildSafeGitEnv());
}

export interface GitGlobalInfo {
  gitBinary: string | null;
  gitVersion: string | null;
  userName: string | null;
  userEmail: string | null;
  credentialHelper: string | null;
}

export function getGitGlobalInfo(): GitGlobalInfo {
  const gitBinary = tryResolveGitBinary();
  if (!gitBinary) {
    return {
      gitBinary: null,
      gitVersion: null,
      userName: null,
      userEmail: null,
      credentialHelper: null,
    };
  }

  const runGit = (args: string[]): string | null => {
    try {
      const out = execFileSync(gitBinary, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return out || null;
    } catch {
      return null;
    }
  };

  return {
    gitBinary,
    gitVersion: runGit(["--version"]),
    userName: runGit(["config", "--global", "user.name"]),
    userEmail: runGit(["config", "--global", "user.email"]),
    credentialHelper: runGit(["config", "--global", "credential.helper"]) || runGit(["config", "--system", "credential.helper"]),
  };
}
