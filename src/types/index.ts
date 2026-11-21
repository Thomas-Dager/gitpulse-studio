export type DetectedStack =
  | "nextjs"
  | "node"
  | "python"
  | "flutter"
  | "rust"
  | "static"
  | "unknown";

export type RepoVisibility = "public" | "private";

export type ProjectSyncState = "untracked" | "dirty" | "ahead" | "synced";

export interface AppConfig {
  id: string;
  rootWorkspacePath: string;
  defaultVisibility: RepoVisibility;
  defaultBranch: string;
  githubUsername: string | null;
  githubToken: string | null;
  geminiApiKey: string | null;
  autoGenerateCommit: boolean;
  blockOnSecrets: boolean;
  updatedAt: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  snippet: string;
}

export interface ProjectGitStatus {
  name: string;
  sanitizedRepoName: string;
  localPath: string;
  detectedStack: DetectedStack;
  isGitInitialized: boolean;
  hasRemote: boolean;
  remoteUrl: string | null;
  githubHtmlUrl: string | null;
  currentBranch: string;
  latestCommitHash: string | null;
  latestCommitMessage: string | null;
  latestCommitDate: string | null;
  latestTag: string | null;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  totalChanges: number;
  aheadCount: number;
  status: ProjectSyncState;
  secretWarningsCount?: number;
}

export interface SyncOptions {
  projectPath: string;
  customMessage?: string;
  visibility?: RepoVisibility;
  branch?: string;
  tag?: string;
  forceIgnoreSecrets?: boolean;
}

export interface SyncResult {
  success: boolean;
  action: "INITIAL_PUBLISH" | "UPDATE_PUSH" | "TAG_RELEASE" | "BLOCKED_SECRET" | "NO_CHANGES" | "FAILED";
  projectName: string;
  repoUrl?: string;
  commitHash?: string;
  commitMessage?: string;
  branch: string;
  tag?: string;
  filesChanged: number;
  createdRepo?: boolean;
  blockedSecrets?: SecretFinding[];
  warnings?: string[];
  error?: string;
}

export interface SyncLogEntry {
  id: string;
  projectId: string;
  projectName: string;
  action: string;
  commitHash: string | null;
  commitMessage: string;
  branch: string;
  tag: string | null;
  filesChanged: number;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  repoUrl: string | null;
  errorDetails: string | null;
  createdAt: string;
}

export interface GitHubAuthStatus {
  authenticatedForApi: boolean;
  method: "env-token" | "db-token" | "gh-cli" | "none";
  username: string | null;
  avatarUrl: string | null;
  gitCredentialManagerActive: boolean;
  tokenCreationUrl: string;
  message: string;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  fixHint?: string;
}

export interface DoctorReport {
  overallOk: boolean;
  checks: DoctorCheck[];
  timestamp: string;
}
