import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppConfig, getDbPath } from "@/lib/db";
import { getGitGlobalInfo } from "@/lib/git/git-binary";
import { getGitHubAuthStatus, TOKEN_CREATION_URL } from "@/lib/github/github-client";
import type { DoctorCheck, DoctorReport } from "@/types";

export interface AntigravityInstallTargets {
  globalSkill: string;
  globalPluginDir: string;
  globalPluginManifest: string;
  globalPluginRules: string;
  globalPluginSkill: string;
  workspaceRootRules: string;
  legacySkill: string;
}

export function getInstalledSkillPath(): string {
  return path.join(os.homedir(), ".gemini", "config", "skills", "github-autosync", "SKILL.md");
}

export function getAntigravityInstallTargets(): AntigravityInstallTargets {
  const home = os.homedir();
  const cfg = getAppConfig();
  const globalPluginDir = path.join(home, ".gemini", "config", "plugins", "gitpulse-studio");
  return {
    globalSkill: path.join(home, ".gemini", "config", "skills", "github-autosync", "SKILL.md"),
    globalPluginDir,
    globalPluginManifest: path.join(globalPluginDir, "plugin.json"),
    globalPluginRules: path.join(globalPluginDir, "rules", "AGENTS.md"),
    globalPluginSkill: path.join(globalPluginDir, "skills", "github-autosync", "SKILL.md"),
    workspaceRootRules: path.join(cfg.rootWorkspacePath, "AGENTS.md"),
    legacySkill: path.join(home, ".gemini", "antigravity", "skills", "github-autosync", "SKILL.md"),
  };
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

  // 4. Antigravity Skill, Plugin Global y Regla Raíz
  const targets = getAntigravityInstallTargets();
  const skillInstalled = fs.existsSync(targets.globalSkill);
  const pluginInstalled =
    fs.existsSync(targets.globalPluginManifest) &&
    fs.existsSync(targets.globalPluginRules) &&
    fs.existsSync(targets.globalPluginSkill);
  const workspaceRulesInstalled = fs.existsSync(targets.workspaceRootRules);

  checks.push({
    name: "Skill Global Antigravity (~/.gemini/config/skills)",
    ok: skillInstalled,
    detail: skillInstalled
      ? `Instalado en ${targets.globalSkill}`
      : `No encontrado en ${targets.globalSkill}`,
    fixHint: skillInstalled ? undefined : "Ejecuta: npm.cmd run install:skill",
  });

  checks.push({
    name: "Plugin Global + Regla Always-On (gitpulse-studio)",
    ok: pluginInstalled,
    detail: pluginInstalled
      ? `Activo en ${targets.globalPluginDir}`
      : `Faltan archivos del plugin en ${targets.globalPluginDir}`,
    fixHint: pluginInstalled ? undefined : "Ejecuta: npm.cmd run install:skill",
  });

  checks.push({
    name: "Regla Jerárquica Workspace (AGENTS.md)",
    ok: workspaceRulesInstalled,
    detail: workspaceRulesInstalled
      ? `Instalada en ${targets.workspaceRootRules}`
      : `No encontrada en ${targets.workspaceRootRules}`,
    fixHint: workspaceRulesInstalled ? undefined : "Ejecuta: npm.cmd run install:skill",
  });

  return {
    overallOk: checks.every((c) => c.ok),
    checks,
    timestamp: new Date().toISOString(),
  };
}
