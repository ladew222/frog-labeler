// src/app/api/labels/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

type Params = { id: string };

export async function PATCH(
  req: Request,
  ctx: { params: Promise<Params> }   // ← params is a Promise now
) {
  try {
    const { user } = await getSessionOrThrow();
    const { id } = await ctx.params;  // ← await it

    const body = await req.json().catch(() => ({}));
    const { name, color, hotkey, projectId: projectIdFromClient } = body ?? {};

    // Find label & project for scoping
    const label = await db.label.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Auth: must be ADMIN on this project
    await requireProjectRole(user.id, label.projectId, "ADMIN");

    // Optional safety: if client sent projectId, ensure it matches
    if (projectIdFromClient && projectIdFromClient !== label.projectId) {
      return NextResponse.json({ error: "projectId mismatch" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      data.name = n;
    }
    if (color !== undefined) data.color = color ?? null;
    if (hotkey !== undefined) data.hotkey = hotkey === null ? null : String(hotkey).slice(0, 1);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
    }

    const updated = await db.label.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden")    return NextResponse.json({ error: msg }, { status: 403 });
    if (err?.code === "P2002")  return NextResponse.json({ error: "Duplicate label name in this project" }, { status: 409 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<Params> }    // ← params as Promise
) {
  try {
    const { user } = await getSessionOrThrow();
    const { id } = await ctx.params;  // ← await it

    // Find label & usage
    const label = await db.label.findUnique({
      where: { id },
      select: { id: true, projectId: true, _count: { select: { segments: true } } },
    });
    if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Auth: ADMIN on this project
    await requireProjectRole(user.id, label.projectId, "ADMIN");

    // Block delete if in use; your UI handles reassignment at /api/labels/reassign
    if (label._count.segments > 0) {
      return NextResponse.json({ error: "Label in use. Reassign segments first." }, { status: 409 });
    }

    await db.label.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden")    return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
