// src/app/api/labels/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

export async function GET(req: Request) {
  try {
    const { user } = await getSessionOrThrow();
    const url = new URL(req.url);
    let projectId = (url.searchParams.get("projectId") || "").trim();
    const audioId  = (url.searchParams.get("audioId")  || "").trim();

    // If no projectId provided, try to derive it from an audioId
    if (!projectId && audioId) {
      const audio = await db.audioFile.findUnique({
        where: { id: audioId },
        select: { projectId: true },
      });
      if (!audio) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
      projectId = audio.projectId;
    }

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    // Must be at least a viewer on this project
    await requireProjectRole(user.id, projectId, "VIEWER");

    const labels = await db.label.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: { _count: { select: { segments: true } } },
    });

    return NextResponse.json(labels);
  } catch (err: any) {
    const msg = String(err?.message || "Internal error");
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden"    ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await getSessionOrThrow();
    const body = await req.json().catch(() => ({} as any));
    const projectId = String(body.projectId || "");
    const name = String(body.name || "").trim();
    const color = body.color ?? null;
    const hotkey = body.hotkey ?? null;

    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    if (!name)      return NextResponse.json({ error: "Name required" },      { status: 400 });

    // Creating labels requires ADMIN on that project
    await requireProjectRole(user.id, projectId, "ADMIN");

    const label = await db.label.create({
      data: { projectId, name, color, hotkey },
    });

    return NextResponse.json(label, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || "Internal error");
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden"    ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
