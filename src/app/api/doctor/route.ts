import { NextResponse } from "next/server";
import { runDoctor } from "@/lib/doctor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runDoctor();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error ejecutando diagnóstico" },
      { status: 500 }
    );
  }
}
