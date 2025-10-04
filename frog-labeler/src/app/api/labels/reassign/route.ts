// src/app/api/labels/reassign/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

export async function POST(req: Request) {
  try {
    const { user } = await getSessionOrThrow();
    const body = await req.json().catch(() => ({}));
    const fromId = String(body?.fromId ?? "");
    const toId   = String(body?.toId ?? "");

    if (!fromId || !toId || fromId === toId) {
      return NextResponse.json({ error: "Invalid fromId/toId" }, { status: 400 });
    }

    // Load both labels to get project scope
    const [from, to] = await Promise.all([
      db.label.findUnique({ where: { id: fromId }, select: { id: true, projectId: true } }),
      db.label.findUnique({ where: { id: toId },   select: { id: true, projectId: true } }),
    ]);
    if (!from || !to) return NextResponse.json({ error: "Label not found" }, { status: 404 });
    if (from.projectId !== to.projectId) {
      return NextResponse.json({ error: "Labels must be in the same project" }, { status: 400 });
    }

    // Auth: ADMIN on the project
    await requireProjectRole(user.id, from.projectId, "ADMIN");

    // Move then delete in a single transaction
    const [moved] = await db.$transaction([
      db.segment.updateMany({ where: { labelId: fromId }, data: { labelId: toId } }),
      db.label.delete({ where: { id: fromId } }),
    ]);

    return NextResponse.json({ ok: true, moved: moved.count });
  } catch (err: any) {
    const msg = String(err?.message || "");
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden"    ? 403 :
      500;
    return NextResponse.json({ error: msg || "Internal error" }, { status });
  }
}
