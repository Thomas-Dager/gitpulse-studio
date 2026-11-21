import { NextRequest, NextResponse } from "next/server";
import {
  inspectWorkspaceProjects,
  syncProjectToGitHub,
} from "@/lib/git/git-manager";
import type { RepoVisibility, SyncResult } from "@/types";

export const dynamic = "force-dynamic";

interface SyncRequestBody {
  projectPath?: string;
  syncAll?: boolean;
  rootPath?: string;
  customMessage?: string;
  visibility?: RepoVisibility;
  branch?: string;
  tag?: string;
  forceIgnoreSecrets?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncRequestBody;

    if (body.syncAll) {
      const projects = await inspectWorkspaceProjects(body.rootPath);
      const pending = projects.filter((p) => p.status !== "synced");

      const results: SyncResult[] = [];
      for (const proj of pending) {
        const res = await syncProjectToGitHub({
          projectPath: proj.localPath,
          customMessage: body.customMessage,
          visibility: body.visibility,
        });
        results.push(res);
      }

      return NextResponse.json({
        syncAll: true,
        totalProcessed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      });
    }

    if (!body.projectPath) {
      return NextResponse.json(
        { error: "Se requiere 'projectPath' o 'syncAll: true'." },
        { status: 400 }
      );
    }

    const result = await syncProjectToGitHub({
      projectPath: body.projectPath,
      customMessage: body.customMessage,
      visibility: body.visibility,
      branch: body.branch,
      tag: body.tag,
      forceIgnoreSecrets: body.forceIgnoreSecrets,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : result.action === "BLOCKED_SECRET" ? 409 : 400,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error durante la sincronización" },
      { status: 500 }
    );
  }
}
