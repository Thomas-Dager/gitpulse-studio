import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import {
  getAppConfig,
  insertSyncLog,
  upsertTrackedProject,
} from "@/lib/db";
import { generateSemanticCommitMessage } from "@/lib/git/commit-generator";
import { createGitInstance, getGitGlobalInfo } from "@/lib/git/git-binary";
import { scanFilesForSecrets, untrackCachedEnvFiles } from "@/lib/git/secret-scanner";
import { detectProjectStack, ensureSmartGitignore } from "@/lib/git/stack-detector";
import {
  ensurePublicRepository,
  remoteUrlToHtmlUrl,
  resolveGitHubToken,
  sanitizeRepoName,
} from "@/lib/github/github-client";
import type {
  ProjectGitStatus,
  ProjectSyncState,
  SyncOptions,
  SyncResult,
} from "@/types";

const IGNORED_WORKSPACE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".venv",
  "venv",
  "dist",
  "build",
  "$recycle.bin",
  "system volume information",
]);

function isValidAppFolder(folderPath: string, folderName: string): boolean {
  const lower = folderName.toLowerCase();
  if (
    folderName.startsWith(".") ||
    lower.startsWith("scoped_dir") ||
    IGNORED_WORKSPACE_DIRS.has(lower)
  ) {
    return false;
  }

  try {
    const entries = fs.readdirSync(folderPath);
    const meaningful = entries.filter(
      (entry) =>
        !entry.startsWith(".") &&
        entry.toLowerCase() !== "node_modules" &&
        entry.toLowerCase() !== "thumbs.db"
    );
    return meaningful.length > 0 || entries.includes(".git");
  } catch {
    return false;
  }
}

function collectSampleFiles(dirPath: string, baseDir = dirPath, maxFiles = 200): string[] {
  const collected: string[] = [];
  const skip = new Set([
    "node_modules",
    ".git",
    ".next",
    ".venv",
    "venv",
    "dist",
    "build",
    "out",
    "__pycache__",
  ]);

  const walk = (current: string) => {
    if (collected.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (collected.length >= maxFiles) break;
      if (skip.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        collected.push(path.relative(baseDir, full));
      }
    }
  };

  walk(dirPath);
  return collected;
}

function parsePorcelainStatus(rawOutput: string): {
  changedFiles: string[];
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  deletedFiles: string[];
} {
  const changedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const stagedFiles: string[] = [];
  const deletedFiles: string[] = [];

  const lines = rawOutput.split(/\r?\n/).filter((l) => l.length >= 4);
  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    let filePath = line.slice(3).trim();
    if (filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ").pop()?.trim() || filePath;
    }
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1);
    }

    changedFiles.push(filePath);
    if (x === "?" && y === "?") {
      untrackedFiles.push(filePath);
    } else {
      if (x !== " " && x !== "?") stagedFiles.push(filePath);
      if (y === "D" || x === "D") {
        deletedFiles.push(filePath);
      } else if (y !== " ") {
        modifiedFiles.push(filePath);
      }
    }
  }

  return { changedFiles, modifiedFiles, untrackedFiles, stagedFiles, deletedFiles };
}

async function hasHeadCommit(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(["--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function inspectProjectGitStatus(
  rawProjectPath: string
): Promise<ProjectGitStatus> {
  const projectPath = path.resolve(rawProjectPath);
  const name = path.basename(projectPath);
  const sanitizedRepoName = sanitizeRepoName(name);
  const detectedStack = detectProjectStack(projectPath);
  const isGitInitialized = fs.existsSync(path.join(projectPath, ".git"));

  if (!isGitInitialized) {
    const files = collectSampleFiles(projectPath);
    return {
      name,
      sanitizedRepoName,
      localPath: projectPath,
      detectedStack,
      isGitInitialized: false,
      hasRemote: false,
      remoteUrl: null,
      githubHtmlUrl: null,
      currentBranch: "main",
      latestCommitHash: null,
      latestCommitMessage: null,
      latestCommitDate: null,
      latestTag: null,
      modifiedFiles: [],
      untrackedFiles: files,
      stagedFiles: [],
      totalChanges: files.length,
      aheadCount: 0,
      status: "untracked",
    };
  }

  const git = createGitInstance(projectPath);

  let currentBranch = "main";
  let aheadCount = 0;
  try {
    const status = await git.status();
    currentBranch = status.current || "main";
    aheadCount = status.ahead || 0;
  } catch {
    // Usar fallback si el repo recién inicializó
  }

  let modifiedFiles: string[] = [];
  let untrackedFiles: string[] = [];
  let stagedFiles: string[] = [];
  let totalChanges = 0;

  try {
    const porcelain = await git.raw(["status", "--porcelain", "-uall"]);
    const parsed = parsePorcelainStatus(porcelain);
    modifiedFiles = parsed.modifiedFiles;
    untrackedFiles = parsed.untrackedFiles;
    stagedFiles = parsed.stagedFiles;
    totalChanges = parsed.changedFiles.length;
  } catch {
    // Ignorar fallo en repo corrupto o recién creado
  }

  let remoteUrl: string | null = null;
  let hasRemote = false;
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin") || remotes[0];
    if (origin) {
      remoteUrl = origin.refs.push || origin.refs.fetch || null;
      hasRemote = Boolean(remoteUrl);
    }
  } catch {
    // Sin remotos
  }

  let latestCommitHash: string | null = null;
  let latestCommitMessage: string | null = null;
  let latestCommitDate: string | null = null;
  try {
    if (await hasHeadCommit(git)) {
      const log = await git.log({ maxCount: 1 });
      if (log.latest) {
        latestCommitHash = log.latest.hash.slice(0, 7);
        latestCommitMessage = log.latest.message;
        latestCommitDate = log.latest.date;
      }
    }
  } catch {
    // Sin commits
  }

  let latestTag: string | null = null;
  try {
    const tags = await git.tags();
    if (tags.latest) {
      latestTag = tags.latest;
    } else if (tags.all.length > 0) {
      latestTag = tags.all[tags.all.length - 1];
    }
  } catch {
    // Sin tags
  }

  let syncState: ProjectSyncState = "synced";
  if (!hasRemote) {
    syncState = "untracked";
  } else if (totalChanges > 0) {
    syncState = "dirty";
  } else if (aheadCount > 0) {
    syncState = "ahead";
  }

  return {
    name,
    sanitizedRepoName,
    localPath: projectPath,
    detectedStack,
    isGitInitialized: true,
    hasRemote,
    remoteUrl,
    githubHtmlUrl: remoteUrlToHtmlUrl(remoteUrl),
    currentBranch,
    latestCommitHash,
    latestCommitMessage,
    latestCommitDate,
    latestTag,
    modifiedFiles,
    untrackedFiles,
    stagedFiles,
    totalChanges,
    aheadCount,
    status: syncState,
  };
}

export async function inspectWorkspaceProjects(
  customRootPath?: string
): Promise<ProjectGitStatus[]> {
  const cfg = getAppConfig();
  const rootPath = path.resolve(customRootPath || cfg.rootWorkspacePath);

  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const appDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(rootPath, entry.name),
    }))
    .filter((dir) => isValidAppFolder(dir.fullPath, dir.name));

  const inspected = await Promise.all(
    appDirs.map((dir) => inspectProjectGitStatus(dir.fullPath))
  );

  const priority: Record<ProjectSyncState, number> = {
    dirty: 0,
    untracked: 1,
    ahead: 2,
    synced: 3,
  };

  return inspected.sort((a, b) => {
    const diff = priority[a.status] - priority[b.status];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

function buildGitAuthConfigArgs(): string[] {
  const { token } = resolveGitHubToken();
  if (!token) return [];
  const basicAuth = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return [
    "-c",
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth}`,
  ];
}

function sanitizeGitError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/AUTHORIZATION:\s*basic\s+[A-Za-z0-9+/=]+/gi, "AUTHORIZATION: basic ***");
}

async function ensureRepoGitIdentity(git: SimpleGit): Promise<void> {
  const globalInfo = getGitGlobalInfo();
  if (!globalInfo.userName) {
    await git.addConfig("user.name", "Thomas Dager");
  }
  if (!globalInfo.userEmail) {
    await git.addConfig("user.email", "tomydager@gmail.com");
  }
  await git.addConfig("core.autocrlf", "true");
  await git.addConfig("core.longpaths", "true");
}

export async function syncProjectToGitHub(
  options: SyncOptions
): Promise<SyncResult> {
  const cfg = getAppConfig();
  const projectPath = path.resolve(options.projectPath);
  const projectName = path.basename(projectPath);
  const targetBranch = options.branch?.trim() || cfg.defaultBranch || "main";
  const visibility = options.visibility || cfg.defaultVisibility || "public";
  const warnings: string[] = [];

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    return {
      success: false,
      action: "FAILED",
      projectName,
      branch: targetBranch,
      filesChanged: 0,
      error: `La carpeta del proyecto no existe: ${projectPath}`,
    };
  }

  // Evitar inicializar Git por accidente en la carpeta raíz del workspace
  if (path.resolve(cfg.rootWorkspacePath).toLowerCase() === projectPath.toLowerCase()) {
    return {
      success: false,
      action: "FAILED",
      projectName,
      branch: targetBranch,
      filesChanged: 0,
      error: "No se puede sincronizar la carpeta raíz del workspace completa como un único repositorio.",
    };
  }

  if (!isValidAppFolder(projectPath, projectName)) {
    return {
      success: false,
      action: "FAILED",
      projectName,
      branch: targetBranch,
      filesChanged: 0,
      error: "La carpeta está vacía o excluida del escaneo.",
    };
  }

  // 1. Auto-.gitignore según el stack detectado
  const { stack, updated: gitignoreUpdated, rulesAdded } = ensureSmartGitignore(projectPath);
  if (gitignoreUpdated) {
    warnings.push(`.gitignore actualizado automáticamente (+${rulesAdded.length} reglas para ${stack}).`);
  }

  const git = createGitInstance(projectPath);
  const hadGitBefore = fs.existsSync(path.join(projectPath, ".git"));

  if (!hadGitBefore) {
    await git.init();
    await ensureRepoGitIdentity(git);
    await git.branch(["-M", targetBranch]);
  } else {
    await ensureRepoGitIdentity(git);
  }

  // 2. Desindexar archivos .env si estaban trackeados por error
  const untrackedEnvs = await untrackCachedEnvFiles(git);
  if (untrackedEnvs.length > 0) {
    warnings.push(
      `Se retiraron del índice de Git archivos sensibles antes de subir: ${untrackedEnvs.join(", ")}`
    );
  }

  // 3. Manejo de rama destino
  const repoHasCommits = await hasHeadCommit(git);
  if (options.branch?.trim()) {
    if (!repoHasCommits) {
      await git.raw(["checkout", "-B", targetBranch]);
    } else {
      const branches = await git.branchLocal();
      if (branches.current !== targetBranch) {
        if (branches.all.includes(targetBranch)) {
          await git.checkout(targetBranch);
        } else {
          await git.checkoutLocalBranch(targetBranch);
        }
      }
    }
  } else if (!repoHasCommits) {
    await git.branch(["-M", targetBranch]);
  }

  const activeBranch = options.branch?.trim() || (await git.status()).current || targetBranch;

  // 4. Inspeccionar archivos cambiados con -uall
  const porcelainRaw = await git.raw(["status", "--porcelain", "-uall"]);
  const parsedStatus = parsePorcelainStatus(porcelainRaw);
  const nonDeletedFiles = parsedStatus.changedFiles.filter(
    (f) => !parsedStatus.deletedFiles.includes(f)
  );

  // Registrar proyecto en SQLite para logs
  const projectId = upsertTrackedProject({
    name: projectName,
    localPath: projectPath,
    detectedStack: stack,
    currentBranch: activeBranch,
  });

  // 5. Escáner preventivo de secretos
  const findings = scanFilesForSecrets(projectPath, nonDeletedFiles);
  if (findings.length > 0 && cfg.blockOnSecrets && !options.forceIgnoreSecrets) {
    insertSyncLog({
      projectId,
      projectName,
      action: "BLOCKED_SECRET",
      commitMessage: "Bloqueado por detección de secretos o .env expuesto",
      branch: activeBranch,
      filesChanged: findings.length,
      status: "BLOCKED",
      errorDetails: findings.map((f) => `${f.file}:${f.line} (${f.type})`).join("; "),
    });

    return {
      success: false,
      action: "BLOCKED_SECRET",
      projectName,
      branch: activeBranch,
      filesChanged: parsedStatus.changedFiles.length,
      blockedSecrets: findings,
      warnings,
      error: `Push bloqueado por seguridad: se detectaron ${findings.length} posible(s) secreto(s) expuesto(s).`,
    };
  }

  // 6. Stage & Commit si hay cambios
  let commitHash: string | undefined;
  let commitMessage = "";
  const filesChanged = parsedStatus.changedFiles.length;

  if (filesChanged > 0) {
    await git.add("-A");
    let diffText = "";
    try {
      const stat = await git.raw(["diff", "--cached", "--stat"]);
      const diff = await git.raw(["diff", "--cached"]);
      diffText = `${stat}\n${diff.slice(0, 6000)}`;
    } catch {
      diffText = "";
    }

    commitMessage = await generateSemanticCommitMessage({
      isInitialCommit: !repoHasCommits,
      stack,
      changedFiles: parsedStatus.changedFiles,
      diffText,
      customMessage: options.customMessage,
    });

    const commitRes = await git.commit(commitMessage);
    commitHash = commitRes.commit || undefined;
    if (!commitHash) {
      const log = await git.log({ maxCount: 1 });
      commitHash = log.latest?.hash.slice(0, 7);
    }
  }

  // 7. Verificar o crear repositorio público en GitHub
  const remotes = await git.getRemotes(true);
  const existingOrigin = remotes.find((r) => r.name === "origin");
  let repoHtmlUrl = existingOrigin
    ? remoteUrlToHtmlUrl(existingOrigin.refs.push || existingOrigin.refs.fetch) || ""
    : "";
  let createdRepo = false;

  try {
    if (!existingOrigin) {
      const repo = await ensurePublicRepository(
        projectName,
        `App ${projectName} (${stack}) sincronizada automáticamente con GitPulse Studio`,
        visibility
      );
      await git.addRemote("origin", repo.cloneUrl);
      repoHtmlUrl = repo.htmlUrl;
      createdRepo = repo.created;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    insertSyncLog({
      projectId,
      projectName,
      action: !hadGitBefore ? "INITIAL_PUBLISH" : "UPDATE_PUSH",
      commitHash: commitHash ?? null,
      commitMessage: commitMessage || "Sin mensaje",
      branch: activeBranch,
      tag: options.tag ?? null,
      filesChanged,
      status: "FAILED",
      errorDetails: errorMsg,
    });
    return {
      success: false,
      action: "FAILED",
      projectName,
      branch: activeBranch,
      commitHash,
      commitMessage,
      filesChanged,
      warnings,
      error: errorMsg,
    };
  }

  // 8. Crear Tag si fue solicitado
  const tagName = options.tag?.trim();
  if (tagName) {
    try {
      const existingTags = await git.tags();
      if (!existingTags.all.includes(tagName)) {
        await git.addAnnotatedTag(tagName, commitMessage || `Release ${tagName}`);
      } else {
        warnings.push(`El tag ${tagName} ya existía localmente.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`No se pudo crear el tag ${tagName}: ${msg}`);
    }
  }

  // 9. Revisar si hace falta hacer push
  const statusAfterCommit = await git.status();
  const needsPush =
    createdRepo ||
    Boolean(commitHash) ||
    statusAfterCommit.ahead > 0 ||
    !statusAfterCommit.tracking ||
    Boolean(tagName);

  if (!needsPush && filesChanged === 0) {
    return {
      success: true,
      action: "NO_CHANGES",
      projectName,
      repoUrl: repoHtmlUrl,
      branch: activeBranch,
      filesChanged: 0,
      warnings: [...warnings, "El repositorio ya está completamente actualizado en GitHub."],
    };
  }

  const authArgs = buildGitAuthConfigArgs();

  try {
    try {
      await git.raw([...authArgs, "push", "-u", "origin", activeBranch]);
    } catch (pushErr) {
      const pushErrMsg = sanitizeGitError(pushErr);
      if (
        pushErrMsg.includes("fetch first") ||
        pushErrMsg.includes("non-fast-forward") ||
        pushErrMsg.includes("rejected")
      ) {
        warnings.push("El repositorio remoto tenía commits previos; integrando historiales automáticamente...");
        await git.raw([
          ...authArgs,
          "pull",
          "origin",
          activeBranch,
          "--allow-unrelated-histories",
          "--no-edit",
        ]);
        await git.raw([...authArgs, "push", "-u", "origin", activeBranch]);
      } else {
        throw new Error(pushErrMsg);
      }
    }

    if (tagName) {
      await git.raw([...authArgs, "push", "origin", "--tags"]);
    }
  } catch (err) {
    const errorMsg = sanitizeGitError(err);
    insertSyncLog({
      projectId,
      projectName,
      action: createdRepo ? "INITIAL_PUBLISH" : "UPDATE_PUSH",
      commitHash: commitHash ?? null,
      commitMessage: commitMessage || "Push pendiente",
      branch: activeBranch,
      tag: tagName ?? null,
      filesChanged,
      status: "FAILED",
      repoUrl: repoHtmlUrl || null,
      errorDetails: errorMsg,
    });
    return {
      success: false,
      action: "FAILED",
      projectName,
      repoUrl: repoHtmlUrl,
      commitHash,
      commitMessage,
      branch: activeBranch,
      tag: tagName,
      filesChanged,
      warnings,
      error: `Error al hacer push a GitHub: ${errorMsg}`,
    };
  }

  const finalAction: SyncResult["action"] = tagName
    ? "TAG_RELEASE"
    : !hadGitBefore || createdRepo
    ? "INITIAL_PUBLISH"
    : "UPDATE_PUSH";

  if (!commitHash) {
    try {
      const latestLog = await git.log({ maxCount: 1 });
      commitHash = latestLog.latest?.hash.slice(0, 7);
      if (!commitMessage) {
        commitMessage = latestLog.latest?.message || "Sincronización de commits pendientes";
      }
    } catch {
      commitMessage = commitMessage || "Sincronización con GitHub";
    }
  }

  upsertTrackedProject({
    name: projectName,
    localPath: projectPath,
    detectedStack: stack,
    githubRepoUrl: repoHtmlUrl || null,
    currentBranch: activeBranch,
    latestTag: tagName ?? null,
    lastSyncedAt: new Date().toISOString(),
  });

  insertSyncLog({
    projectId,
    projectName,
    action: finalAction,
    commitHash: commitHash ?? null,
    commitMessage,
    branch: activeBranch,
    tag: tagName ?? null,
    filesChanged,
    status: "SUCCESS",
    repoUrl: repoHtmlUrl || null,
  });

  return {
    success: true,
    action: finalAction,
    projectName,
    repoUrl: repoHtmlUrl,
    commitHash,
    commitMessage,
    branch: activeBranch,
    tag: tagName,
    filesChanged,
    createdRepo,
    warnings,
  };
}

export async function createBranchOrTag(params: {
  projectPath: string;
  branch?: string;
  tag?: string;
  push?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const projectPath = path.resolve(params.projectPath);
  if (!fs.existsSync(path.join(projectPath, ".git"))) {
    return {
      success: false,
      message: "El proyecto aún no tiene Git inicializado. Sincronízalo primero.",
    };
  }

  const git = createGitInstance(projectPath);
  const authArgs = buildGitAuthConfigArgs();
  const actions: string[] = [];

  if (params.branch?.trim()) {
    const b = params.branch.trim();
    const branches = await git.branchLocal();
    if (branches.all.includes(b)) {
      await git.checkout(b);
      actions.push(`Rama cambiada a '${b}'`);
    } else {
      await git.checkoutLocalBranch(b);
      actions.push(`Rama '${b}' creada`);
    }
    if (params.push) {
      const remotes = await git.getRemotes();
      if (remotes.some((r) => r.name === "origin")) {
        await git.raw([...authArgs, "push", "-u", "origin", b]);
        actions.push("y subida a GitHub");
      }
    }
  }

  if (params.tag?.trim()) {
    const t = params.tag.trim();
    await git.addAnnotatedTag(t, `Release ${t}`);
    actions.push(`Tag '${t}' creado`);
    if (params.push) {
      const remotes = await git.getRemotes();
      if (remotes.some((r) => r.name === "origin")) {
        await git.raw([...authArgs, "push", "origin", "--tags"]);
        actions.push("y publicado en GitHub");
      }
    }
  }

  return {
    success: true,
    message: actions.join(" ") || "Sin cambios solicitados.",
  };
}
