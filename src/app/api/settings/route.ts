import { NextRequest, NextResponse } from "next/server";
import { getAppConfig, updateAppConfig } from "@/lib/db";
import { getGitHubAuthStatus } from "@/lib/github/github-client";
import type { RepoVisibility } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = getAppConfig();
    const authStatus = await getGitHubAuthStatus();
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error cargando configuración" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      rootWorkspacePath?: string;
      defaultVisibility?: RepoVisibility;
      defaultBranch?: string;
      githubToken?: string | null;
      geminiApiKey?: string | null;
      autoGenerateCommit?: boolean;
      blockOnSecrets?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.rootWorkspacePath === "string" && body.rootWorkspacePath.trim()) {
      patch.rootWorkspacePath = body.rootWorkspacePath.trim();
    }
    if (body.defaultVisibility === "public" || body.defaultVisibility === "private") {
      patch.defaultVisibility = body.defaultVisibility;
    }
    if (typeof body.defaultBranch === "string" && body.defaultBranch.trim()) {
      patch.defaultBranch = body.defaultBranch.trim();
    }
    if (body.githubToken !== undefined) {
      patch.githubToken = body.githubToken ? body.githubToken.trim() : null;
    }
    if (body.geminiApiKey !== undefined) {
      patch.geminiApiKey = body.geminiApiKey ? body.geminiApiKey.trim() : null;
    }
    if (typeof body.autoGenerateCommit === "boolean") {
      patch.autoGenerateCommit = body.autoGenerateCommit;
    }
    if (typeof body.blockOnSecrets === "boolean") {
      patch.blockOnSecrets = body.blockOnSecrets;
    }

    const updated = updateAppConfig(patch);
    const authStatus = await getGitHubAuthStatus();

    return NextResponse.json({
      config: {
        rootWorkspacePath: updated.rootWorkspacePath,
        defaultVisibility: updated.defaultVisibility,
        defaultBranch: updated.defaultBranch,
        githubUsername: updated.githubUsername,
        autoGenerateCommit: updated.autoGenerateCommit,
        blockOnSecrets: updated.blockOnSecrets,
        hasGithubToken: Boolean(process.env.GITHUB_TOKEN || updated.githubToken),
        hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY || updated.geminiApiKey),
      },
      authStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando configuración" },
      { status: 500 }
    );
  }
}
