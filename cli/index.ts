import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import dotenv from "dotenv";
import { getAppConfig, updateAppConfig } from "@/lib/db";
import { getInstalledSkillPath, runDoctor } from "@/lib/doctor";
import {
  inspectProjectGitStatus,
  inspectWorkspaceProjects,
  syncProjectToGitHub,
} from "@/lib/git/git-manager";
import { scanFilesForSecrets } from "@/lib/git/secret-scanner";
import { getGitHubAuthStatus, TOKEN_CREATION_URL } from "@/lib/github/github-client";
import type { SyncResult } from "@/types";

const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

function printSyncResult(res: SyncResult): void {
  if (res.warnings && res.warnings.length > 0) {
    for (const w of res.warnings) {
      console.log(`  [AVISO] ${w}`);
    }
  }

  if (res.action === "BLOCKED_SECRET" && res.blockedSecrets) {
    console.error(`\n[BLOQUEADO] ${res.projectName}: ${res.error}`);
    for (const finding of res.blockedSecrets) {
      console.error(`  - ${finding.file}:${finding.line} -> ${finding.type} (${finding.snippet})`);
    }
    console.error("  Mueve las claves a .env o usa --force si estás seguro de que es un falso positivo.\n");
    return;
  }

  if (!res.success) {
    console.error(`\n[ERROR] ${res.projectName}: ${res.error}\n`);
    return;
  }

  if (res.action === "NO_CHANGES") {
    console.log(`[AL DÍA] ${res.projectName} (${res.branch})${res.repoUrl ? ` -> ${res.repoUrl}` : ""}`);
    return;
  }

  console.log(`\n[OK] ${res.projectName} sincronizado (${res.action})`);
  if (res.repoUrl) console.log(`  Repo Público : ${res.repoUrl}`);
  console.log(`  Rama         : ${res.branch}`);
  if (res.tag) console.log(`  Tag          : ${res.tag}`);
  if (res.commitHash) console.log(`  Commit       : ${res.commitHash} - ${res.commitMessage}`);
  console.log(`  Archivos     : ${res.filesChanged}`);
  console.log("");
}

const program = new Command();

program
  .name("gitpulse")
  .description("GitPulse Studio CLI — Publica y actualiza tus apps automáticamente en GitHub")
  .version("1.0.0");

program
  .command("sync [projectPath]")
  .description("Sincroniza una app con GitHub (crea repo público si no existe, protege secretos, genera commit y hace push)")
  .option("-m, --message <msg>", "Mensaje o nota personalizada para el commit")
  .option("-b, --branch <branch>", "Rama destino (por defecto: main)")
  .option("-t, --tag <tag>", "Etiqueta de versión a crear y subir (ej. v1.0.0)")
  .option("--private", "Crear repositorio como privado en lugar de público")
  .option("--force", "Ignorar bloqueo preventivo del escáner de secretos")
  .action(async (projectPath: string | undefined, opts: {
    message?: string;
    branch?: string;
    tag?: string;
    private?: boolean;
    force?: boolean;
  }) => {
    const targetPath = path.resolve(projectPath || process.cwd());
    console.log(`Sincronizando proyecto: ${targetPath}`);
    const result = await syncProjectToGitHub({
      projectPath: targetPath,
      customMessage: opts.message,
      branch: opts.branch,
      tag: opts.tag,
      visibility: opts.private ? "private" : "public",
      forceIgnoreSecrets: Boolean(opts.force),
    });

    printSyncResult(result);
    if (!result.success) {
      process.exitCode = 1;
    }
  });

program
  .command("sync-all [rootPath]")
  .description("Escanea el workspace raíz y sube todas las apps nuevas o con cambios pendientes")
  .option("--private", "Crear nuevos repositorios como privados")
  .option("--force", "Ignorar bloqueo de secretos")
  .action(async (rootPath: string | undefined, opts: { private?: boolean; force?: boolean }) => {
    const cfg = getAppConfig();
    const targetRoot = path.resolve(rootPath || cfg.rootWorkspacePath);
    console.log(`Escaneando apps en: ${targetRoot}`);
    const projects = await inspectWorkspaceProjects(targetRoot);
    const pending = projects.filter((p) => p.status !== "synced");

    if (pending.length === 0) {
      console.log("Todas las aplicaciones están sincronizadas al día.");
      return;
    }

    console.log(`Se encontraron ${pending.length} aplicaciones pendientes de sincronizar...\n`);
    let hasErrors = false;
    for (const proj of pending) {
      const res = await syncProjectToGitHub({
        projectPath: proj.localPath,
        visibility: opts.private ? "private" : "public",
        forceIgnoreSecrets: Boolean(opts.force),
      });
      printSyncResult(res);
      if (!res.success) hasErrors = true;
    }

    if (hasErrors) process.exitCode = 1;
  });

program
  .command("status [targetPath]")
  .description("Muestra el estado Git de una app o de todo el workspace")
  .action(async (targetPath: string | undefined) => {
    const cfg = getAppConfig();
    const resolved = path.resolve(targetPath || process.cwd());
    const rootResolved = path.resolve(cfg.rootWorkspacePath);

    if (resolved.toLowerCase() === rootResolved.toLowerCase()) {
      const projects = await inspectWorkspaceProjects(resolved);
      console.log(`\nEstado del Workspace (${resolved}) — ${projects.length} apps:\n`);
      for (const p of projects) {
        const stateTag =
          p.status === "synced"
            ? "[AL DÍA]"
            : p.status === "dirty"
            ? `[CAMBIOS: ${p.totalChanges}]`
            : p.status === "ahead"
            ? `[POR SUBIR: ${p.aheadCount}]`
            : "[SIN SUBIR]";
        console.log(
          `  ${stateTag.padEnd(16)} ${p.name.padEnd(22)} (${p.detectedStack.padEnd(7)}) ${p.githubHtmlUrl || "sin remoto"}`
        );
      }
      console.log("");
      return;
    }

    const status = await inspectProjectGitStatus(resolved);
    const candidateFiles = [...status.modifiedFiles, ...status.untrackedFiles, ...status.stagedFiles];
    const findings = scanFilesForSecrets(resolved, candidateFiles);

    console.log(`\nProyecto: ${status.name} (${status.detectedStack})`);
    console.log(`  Ruta        : ${status.localPath}`);
    console.log(`  Estado      : ${status.status.toUpperCase()}`);
    console.log(`  Git Init    : ${status.isGitInitialized ? "Sí" : "No"}`);
    console.log(`  Rama        : ${status.currentBranch}`);
    console.log(`  Repo GitHub : ${status.githubHtmlUrl || `(Se creará como ${status.sanitizedRepoName})`}`);
    if (status.latestCommitHash) {
      console.log(`  Últ. Commit : ${status.latestCommitHash} - ${status.latestCommitMessage}`);
    }
    if (status.latestTag) {
      console.log(`  Últ. Tag    : ${status.latestTag}`);
    }
    console.log(`  Cambios     : ${status.totalChanges} archivo(s)`);
    if (findings.length > 0) {
      console.log(`  [ALERTA]    : ${findings.length} posible(s) secreto(s) detectado(s) antes de subir:`);
      for (const f of findings) {
        console.log(`    - ${f.file}:${f.line} (${f.type})`);
      }
    }
    console.log("");
  });

program
  .command("auth")
  .description("Configura el Token de GitHub o Gemini API Key para GitPulse")
  .option("--token <githubToken>", "Personal Access Token de GitHub (scope: repo)")
  .option("--gemini <geminiApiKey>", "API Key de Gemini para redactar commits con IA")
  .action(async (opts: { token?: string; gemini?: string }) => {
    if (!opts.token && !opts.gemini) {
      const auth = await getGitHubAuthStatus();
      console.log(`\nEstado GitHub: ${auth.message}`);
      console.log(`Crear token : ${TOKEN_CREATION_URL}\n`);
      return;
    }

    const patch: { githubToken?: string; geminiApiKey?: string } = {};
    if (opts.token) patch.githubToken = opts.token.trim();
    if (opts.gemini) patch.geminiApiKey = opts.gemini.trim();

    updateAppConfig(patch);
    const auth = await getGitHubAuthStatus();
    console.log(`\nConfiguración actualizada. ${auth.message}\n`);
  });

program
  .command("doctor")
  .description("Verifica git.exe, autenticación de GitHub, base de datos SQLite y Skill de Antigravity")
  .action(async () => {
    const report = await runDoctor();
    console.log("\n=== GitPulse Studio Doctor ===\n");
    for (const check of report.checks) {
      const prefix = check.ok ? "[OK]  " : "[WARN]";
      console.log(`${prefix} ${check.name}`);
      console.log(`       ${check.detail}`);
      if (check.fixHint) {
        console.log(`       -> ${check.fixHint}`);
      }
    }
    console.log(`\nResultado general: ${report.overallOk ? "TODO LISTO" : "ATENCIÓN REQUERIDA"}\n`);
  });

program
  .command("install-skill")
  .description("Instala el Skill nativo github-autosync en ~/.gemini/antigravity/skills/")
  .action(() => {
    const source = path.join(projectRoot, "antigravity-skill", "SKILL.md");
    const dest = getInstalledSkillPath();

    if (!fs.existsSync(source)) {
      console.error(`No se encontró la plantilla del Skill en ${source}`);
      process.exitCode = 1;
      return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    console.log(`[OK] Skill 'github-autosync' instalado correctamente en:\n     ${dest}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Error fatal en GitPulse CLI:", err instanceof Error ? err.message : err);
  process.exit(1);
});
