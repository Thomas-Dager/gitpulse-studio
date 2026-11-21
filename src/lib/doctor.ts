import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppConfig, getDbPath } from "@/lib/db";
import { getGitGlobalInfo } from "@/lib/git/git-binary";
import { getGitHubAuthStatus, TOKEN_CREATION_URL } from "@/lib/github/github-client";
import type { DoctorCheck, DoctorReport } from "@/types";

export function getInstalledSkillPath(): string {
  return path.join(os.homedir(), ".gemini", "antigravity", "skills", "github-autosync", "SKILL.md");
}

export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // 1. Git Binary & Identity
  const gitInfo = getGitGlobalInfo();
  checks.push({
    name: "Binario Git (git.exe)",
    ok: Boolean(gitInfo.gitBinary),
    detail: gitInfo.gitBinary
      ? `${gitInfo.gitVersion || "Git"} encontrado en ${gitInfo.gitBinary}`
      : "No se encontró git.exe en PATH ni en GitHub Desktop.",
    fixHint: gitInfo.gitBinary
      ? undefined
      : "Instala Git para Windows o GitHub Desktop, o define GIT_BINARY_PATH en .env.",
  });

  checks.push({
    name: "Identidad Git Global",
    ok: Boolean(gitInfo.userName && gitInfo.userEmail),
    detail:
      gitInfo.userName && gitInfo.userEmail
        ? `${gitInfo.userName} <${gitInfo.userEmail}>`
        : "Falta user.name o user.email en configuración global de Git.",
    fixHint:
      gitInfo.userName && gitInfo.userEmail
        ? undefined
        : "GitPulse usará identidad por defecto al inicializar repositorios.",
  });

  // 2. GitHub Auth
  const ghStatus = await getGitHubAuthStatus();
  checks.push({
    name: "API GitHub (Creación automática de repos públicos)",
    ok: ghStatus.authenticatedForApi,
    detail: ghStatus.message,
    fixHint: ghStatus.authenticatedForApi
      ? undefined
      : `Genera un Token (scope: repo) en ${TOKEN_CREATION_URL} y ejecútalo con: gitpulse auth --token TU_TOKEN`,
  });

  // 3. Base de datos SQLite y Workspace
  try {
    const dbPath = getDbPath();
    const cfg = getAppConfig();
    const workspaceExists = fs.existsSync(cfg.rootWorkspacePath);
    checks.push({
      name: "Base de datos SQLite (node:sqlite)",
      ok: true,
      detail: `Operativa en ${dbPath}`,
    });
    checks.push({
      name: "Carpeta Workspace Raíz",
      ok: workspaceExists,
      detail: workspaceExists
        ? `Escaneando aplicaciones en ${cfg.rootWorkspacePath}`
        : `La carpeta configurada no existe: ${cfg.rootWorkspacePath}`,
      fixHint: workspaceExists ? undefined : "Actualiza la ruta raíz desde Ajustes en el Dashboard.",
    });
  } catch (err) {
    checks.push({
      name: "Base de datos SQLite",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Antigravity Skill
  const skillPath = getInstalledSkillPath();
  const skillInstalled = fs.existsSync(skillPath);
  checks.push({
    name: "Skill Nativo Antigravity (github-autosync)",
    ok: skillInstalled,
    detail: skillInstalled
      ? `Instalado en ${skillPath}`
      : `No encontrado en ${skillPath}`,
    fixHint: skillInstalled ? undefined : "Ejecuta: npm.cmd run install:skill",
  });

  return {
    overallOk: checks.every((c) => c.ok),
    checks,
    timestamp: new Date().toISOString(),
  };
}
