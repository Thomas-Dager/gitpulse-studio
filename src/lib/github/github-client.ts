import { execFileSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { getAppConfig, updateAppConfig } from "@/lib/db";
import { getGitGlobalInfo } from "@/lib/git/git-binary";
import type { GitHubAuthStatus, RepoVisibility } from "@/types";

export const TOKEN_CREATION_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=GitPulse+Studio";

export function sanitizeRepoName(folderName: string): string {
  const normalized = folderName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return normalized || "gitpulse-app";
}

export function remoteUrlToHtmlUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const trimmed = remoteUrl.trim();
  if (trimmed.startsWith("https://github.com/")) {
    return trimmed.replace(/\.git$/, "");
  }
  const sshMatch = trimmed.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }
  return trimmed.replace(/\.git$/, "");
}

function tryGhCliToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function resolveGitHubToken(): {
  token: string | null;
  method: "env-token" | "db-token" | "gh-cli" | "none";
} {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, method: "env-token" };
  }

  const cfg = getAppConfig();
  if (cfg.githubToken?.trim()) {
    return { token: cfg.githubToken.trim(), method: "db-token" };
  }

  const ghToken = tryGhCliToken();
  if (ghToken) {
    return { token: ghToken, method: "gh-cli" };
  }

  return { token: null, method: "none" };
}

export async function getGitHubAuthStatus(): Promise<GitHubAuthStatus> {
  const { token, method } = resolveGitHubToken();
  const gitInfo = getGitGlobalInfo();
  const cfg = getAppConfig();
  const gitCredentialManagerActive = Boolean(gitInfo.credentialHelper);

  if (!token) {
    return {
      authenticatedForApi: false,
      method: "none",
      username: cfg.githubUsername,
      avatarUrl: null,
      gitCredentialManagerActive,
      tokenCreationUrl: TOKEN_CREATION_URL,
      message: gitCredentialManagerActive
        ? "Git Credential Manager activo para hacer push a repos existentes. Para crear repos públicos nuevos automáticamente, configura un Token de GitHub (scope: repo)."
        : "No se detectó Token de GitHub ni gh CLI autenticado.",
    };
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();

    if (cfg.githubUsername !== data.login) {
      updateAppConfig({ githubUsername: data.login });
    }

    return {
      authenticatedForApi: true,
      method,
      username: data.login,
      avatarUrl: data.avatar_url,
      gitCredentialManagerActive,
      tokenCreationUrl: TOKEN_CREATION_URL,
      message: `Conectado a GitHub como @${data.login} (${method}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      authenticatedForApi: false,
      method,
      username: cfg.githubUsername,
      avatarUrl: null,
      gitCredentialManagerActive,
      tokenCreationUrl: TOKEN_CREATION_URL,
      message: `El token de GitHub configurado falló o expiró: ${msg}`,
    };
  }
}

export interface EnsureRepoResult {
  cloneUrl: string;
  htmlUrl: string;
  owner: string;
  repoName: string;
  created: boolean;
}

export async function ensurePublicRepository(
  rawRepoName: string,
  description?: string,
  visibility: RepoVisibility = "public"
): Promise<EnsureRepoResult> {
  const { token } = resolveGitHubToken();
  if (!token) {
    throw new Error(
      `Se necesita un Token de GitHub (scope: repo) para crear repositorios automáticamente en GitHub. ` +
        `Créalo en ${TOKEN_CREATION_URL} y guárdalo en Ajustes del Dashboard o ejecutando: gitpulse auth --token TU_TOKEN`
    );
  }

  const repoName = sanitizeRepoName(rawRepoName);
  const octokit = new Octokit({ auth: token });
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;

  try {
    const { data: existing } = await octokit.rest.repos.get({
      owner,
      repo: repoName,
    });
    return {
      cloneUrl: existing.clone_url,
      htmlUrl: existing.html_url,
      owner,
      repoName: existing.name,
      created: false,
    };
  } catch (err: unknown) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? Number((err as { status?: number }).status)
        : 0;

    if (status !== 404) {
      throw err;
    }
  }

  const { data: createdRepo } = await octokit.rest.repos.createForAuthenticatedUser({
    name: repoName,
    description:
      description || `Publicado automáticamente con GitPulse Studio`,
    private: visibility === "private",
    auto_init: false,
  });

  return {
    cloneUrl: createdRepo.clone_url,
    htmlUrl: createdRepo.html_url,
    owner,
    repoName: createdRepo.name,
    created: true,
  };
}
