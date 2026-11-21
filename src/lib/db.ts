import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppConfig, RepoVisibility, SyncLogEntry } from "@/types";

interface SQLiteStatement {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
}

interface SQLiteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SQLiteStatement;
}

function loadDatabaseSync(): new (path: string) => SQLiteDatabase {
  // Carga dinámica compatible con Next.js server y CLI tsx en Node v24
  const dynamicRequire =
    typeof require === "function" ? require : createRequire(import.meta.url);
  const sqliteModule = dynamicRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => SQLiteDatabase;
  };
  return sqliteModule.DatabaseSync;
}

function resolveProjectRoot(): string {
  // Asegura que siempre guarde en la raíz del proyecto gitpulse-studio incluso si el CLI se invoca desde otra carpeta
  const candidates = [
    path.resolve(__dirname, "..", ".."),
    path.resolve(process.cwd()),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return "d:\\Antigravity\\CREADOR\\gitpulse-studio";
}

let dbInstance: SQLiteDatabase | null = null;

export function getDbPath(): string {
  const rootDir = resolveProjectRoot();
  const dataDir = path.join(rootDir, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "gitpulse.db");
}

export function getDb(): SQLiteDatabase {
  if (dbInstance) return dbInstance;

  const DatabaseSync = loadDatabaseSync();
  const dbPath = getDbPath();
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_config (
      id TEXT PRIMARY KEY,
      root_workspace_path TEXT NOT NULL DEFAULT 'D:\\Antigravity',
      default_visibility TEXT NOT NULL DEFAULT 'public',
      default_branch TEXT NOT NULL DEFAULT 'main',
      github_username TEXT DEFAULT 'Thomas-Dager',
      github_token TEXT,
      gemini_api_key TEXT,
      auto_generate_commit INTEGER NOT NULL DEFAULT 1,
      block_on_secrets INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracked_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL UNIQUE,
      detected_stack TEXT NOT NULL,
      github_repo_url TEXT,
      current_branch TEXT NOT NULL DEFAULT 'main',
      latest_tag TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      action TEXT NOT NULL,
      commit_hash TEXT,
      commit_message TEXT NOT NULL,
      branch TEXT NOT NULL,
      tag TEXT,
      files_changed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      repo_url TEXT,
      error_details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES tracked_projects(id) ON DELETE CASCADE
    );
  `);

  const existing = db
    .prepare("SELECT id FROM app_config WHERE id = ?")
    .get("singleton");

  if (!existing) {
    const defaultRoot =
      process.env.DEFAULT_WORKSPACE_ROOT?.trim() || "D:\\Antigravity";
    db.prepare(
      `INSERT INTO app_config (
        id, root_workspace_path, default_visibility, default_branch,
        github_username, github_token, gemini_api_key,
        auto_generate_commit, block_on_secrets, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "singleton",
      defaultRoot,
      "public",
      "main",
      "Thomas-Dager",
      null,
      null,
      1,
      1,
      new Date().toISOString()
    );
  }

  dbInstance = db;
  return db;
}

export function getAppConfig(): AppConfig {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM app_config WHERE id = ?")
    .get("singleton") as Record<string, unknown>;

  return {
    id: String(row.id),
    rootWorkspacePath: String(row.root_workspace_path || "D:\\Antigravity"),
    defaultVisibility: (row.default_visibility === "private" ? "private" : "public") as RepoVisibility,
    defaultBranch: String(row.default_branch || "main"),
    githubUsername: row.github_username ? String(row.github_username) : null,
    githubToken: row.github_token ? String(row.github_token) : null,
    geminiApiKey: row.gemini_api_key ? String(row.gemini_api_key) : null,
    autoGenerateCommit: Boolean(row.auto_generate_commit),
    blockOnSecrets: Boolean(row.block_on_secrets),
    updatedAt: String(row.updated_at),
  };
}

export function updateAppConfig(
  partial: Partial<Omit<AppConfig, "id" | "updatedAt">>
): AppConfig {
  const db = getDb();
  const current = getAppConfig();

  const next: AppConfig = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE app_config SET
      root_workspace_path = ?,
      default_visibility = ?,
      default_branch = ?,
      github_username = ?,
      github_token = ?,
      gemini_api_key = ?,
      auto_generate_commit = ?,
      block_on_secrets = ?,
      updated_at = ?
     WHERE id = 'singleton'`
  ).run(
    next.rootWorkspacePath,
    next.defaultVisibility,
    next.defaultBranch,
    next.githubUsername,
    next.githubToken,
    next.geminiApiKey,
    next.autoGenerateCommit ? 1 : 0,
    next.blockOnSecrets ? 1 : 0,
    next.updatedAt
  );

  return next;
}

export function upsertTrackedProject(input: {
  name: string;
  localPath: string;
  detectedStack: string;
  githubRepoUrl?: string | null;
  currentBranch?: string;
  latestTag?: string | null;
  lastSyncedAt?: string | null;
}): string {
  const db = getDb();
  const normalizedPath = path.resolve(input.localPath);
  const existing = db
    .prepare("SELECT id, github_repo_url, latest_tag, last_synced_at FROM tracked_projects WHERE local_path = ?")
    .get(normalizedPath) as Record<string, unknown> | undefined;

  if (existing) {
    const id = String(existing.id);
    db.prepare(
      `UPDATE tracked_projects SET
        name = ?,
        detected_stack = ?,
        github_repo_url = COALESCE(?, github_repo_url),
        current_branch = COALESCE(?, current_branch),
        latest_tag = COALESCE(?, latest_tag),
        last_synced_at = COALESCE(?, last_synced_at)
       WHERE id = ?`
    ).run(
      input.name,
      input.detectedStack,
      input.githubRepoUrl ?? null,
      input.currentBranch ?? "main",
      input.latestTag ?? null,
      input.lastSyncedAt ?? null,
      id
    );
    return id;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO tracked_projects (
      id, name, local_path, detected_stack, github_repo_url,
      current_branch, latest_tag, last_synced_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    normalizedPath,
    input.detectedStack,
    input.githubRepoUrl ?? null,
    input.currentBranch ?? "main",
    input.latestTag ?? null,
    input.lastSyncedAt ?? null,
    new Date().toISOString()
  );

  return id;
}

export function insertSyncLog(input: {
  projectId: string;
  projectName: string;
  action: string;
  commitHash?: string | null;
  commitMessage: string;
  branch: string;
  tag?: string | null;
  filesChanged: number;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  repoUrl?: string | null;
  errorDetails?: string | null;
}): SyncLogEntry {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO sync_logs (
      id, project_id, project_name, action, commit_hash, commit_message,
      branch, tag, files_changed, status, repo_url, error_details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.projectId,
    input.projectName,
    input.action,
    input.commitHash ?? null,
    input.commitMessage,
    input.branch,
    input.tag ?? null,
    input.filesChanged,
    input.status,
    input.repoUrl ?? null,
    input.errorDetails ?? null,
    createdAt
  );

  return {
    id,
    projectId: input.projectId,
    projectName: input.projectName,
    action: input.action,
    commitHash: input.commitHash ?? null,
    commitMessage: input.commitMessage,
    branch: input.branch,
    tag: input.tag ?? null,
    filesChanged: input.filesChanged,
    status: input.status,
    repoUrl: input.repoUrl ?? null,
    errorDetails: input.errorDetails ?? null,
    createdAt,
  };
}

export function getRecentSyncLogs(limit = 30): SyncLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    action: String(row.action),
    commitHash: row.commit_hash ? String(row.commit_hash) : null,
    commitMessage: String(row.commit_message),
    branch: String(row.branch),
    tag: row.tag ? String(row.tag) : null,
    filesChanged: Number(row.files_changed || 0),
    status: (row.status as "SUCCESS" | "FAILED" | "BLOCKED") || "FAILED",
    repoUrl: row.repo_url ? String(row.repo_url) : null,
    errorDetails: row.error_details ? String(row.error_details) : null,
    createdAt: String(row.created_at),
  }));
}
