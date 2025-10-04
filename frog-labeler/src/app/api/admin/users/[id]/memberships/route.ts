export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

type P = { params: Promise<{ id: string }> };
const PROJ_ROLES = new Set(["VIEWER", "MEMBER", "ADMIN", "OWNER"]);

/** Add or update a membership */
export async function POST(req: Request, { params }: P) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;
  const { projectId, role } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    role?: string;
  };

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!role || !PROJ_ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid membership role" }, { status: 400 });
  }

  const up = await db.projectMembership.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role: role as any },
    create: { projectId, userId, role: role as any },
    include: { project: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    ok: true,
    membership: {
      projectId: up.projectId,
      projectName: up.project.name,
      role: up.role,
    },
  });
}

/** Remove a membership */
export async function DELETE(req: Request, { params }: P) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;
  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  await db.projectMembership.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  return NextResponse.json({ ok: true });
}
