import { NextRequest, NextResponse } from "next/server";
import { createBranchOrTag } from "@/lib/git/git-manager";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectPath?: string;
      branch?: string;
      tag?: string;
      push?: boolean;
    };

    if (!body.projectPath) {
      return NextResponse.json(
        { error: "Se requiere 'projectPath'." },
        { status: 400 }
      );
    }

    const result = await createBranchOrTag({
      projectPath: body.projectPath,
      branch: body.branch,
      tag: body.tag,
      push: body.push ?? true,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear rama o tag" },
      { status: 500 }
    );
  }
}
