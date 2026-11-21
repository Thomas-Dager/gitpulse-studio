import { NextRequest, NextResponse } from "next/server";
import { getAppConfig, getRecentSyncLogs } from "@/lib/db";
import { getGitGlobalInfo } from "@/lib/git/git-binary";
import { inspectWorkspaceProjects } from "@/lib/git/git-manager";
import { getGitHubAuthStatus } from "@/lib/github/github-client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const customRoot = req.nextUrl.searchParams.get("root") || undefined;
    const cfg = getAppConfig();
    const [projects, authStatus] = await Promise.all([
      inspectWorkspaceProjects(customRoot),
      getGitHubAuthStatus(),
    ]);
    const logs = getRecentSyncLogs(30);
    const gitInfo = getGitGlobalInfo();

    return NextResponse.json({
      config: {
        rootWorkspacePath: cfg.rootWorkspacePath,
        defaultVisibility: cfg.defaultVisibility,
        defaultBranch: cfg.defaultBranch,
        githubUsername: cfg.githubUsername,
        autoGenerateCommit: cfg.autoGenerateCommit,
        blockOnSecrets: cfg.blockOnSecrets,
        hasGithubToken: Boolean(process.env.GITHUB_TOKEN || cfg.githubToken),
        hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY || cfg.geminiApiKey),
      },
      authStatus,
      gitInfo,
      projects,
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error escaneando proyectos" },
      { status: 500 }
    );
  }
}
