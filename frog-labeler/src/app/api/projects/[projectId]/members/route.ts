export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

type ParamP = { params: Promise<{ projectId: string }> };
const ROLES = new Set(["VIEWER", "MEMBER", "ADMIN", "OWNER"]);

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/** POST: add (or upsert) a member by email. Optional body.role */
export async function POST(req: Request, { params }: ParamP) {
  const { user } = await getSessionOrThrow();
  const { projectId } = await params;
  const pid = projectId?.trim();
  if (!pid) return bad("projectId missing");

  await requireProjectRole(user.id, pid, "ADMIN");

  const body = await req.json().catch(() => ({} as any));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role  = String(body?.role ?? "MEMBER").toUpperCase();
  if (!email) return bad("Email required");
  if (!ROLES.has(role)) return bad("Invalid role");

  const invitee = await db.user.findUnique({ where: { email } });
  if (!invitee) return bad("User not found", 404);

  const m = await db.projectMembership.upsert({
    where: { projectId_userId: { projectId: pid, userId: invitee.id } },
    update: { role: role as any },
    create: { projectId: pid, userId: invitee.id, role: role as any },
  });

  return NextResponse.json({ ok: true, membershipId: m.id }, { status: 201 });
}

/** PUT: change a member's project role */
export async function PUT(req: Request, { params }: ParamP) {
  const { user } = await getSessionOrThrow();
  const { projectId } = await params;
  const pid = projectId?.trim();
  if (!pid) return bad("projectId missing");

  await requireProjectRole(user.id, pid, "ADMIN");

  const body = await req.json().catch(() => ({} as any));
  const userId = String(body?.userId ?? "").trim();
  const role   = String(body?.role ?? "").toUpperCase();

  if (!userId) return bad("userId required");
  if (!ROLES.has(role)) return bad("Invalid role");

  const m = await db.projectMembership.update({
    where: { projectId_userId: { projectId: pid, userId } },
    data: { role: role as any },
  });

  return NextResponse.json({ ok: true, membershipId: m.id });
}

/** DELETE: remove a member from the project */
export async function DELETE(req: Request, { params }: ParamP) {
  const { user } = await getSessionOrThrow();
  const { projectId } = await params;
  const pid = projectId?.trim();
  if (!pid) return bad("projectId missing");

  await requireProjectRole(user.id, pid, "ADMIN");

  const body = await req.json().catch(() => ({} as any));
  const userId = String(body?.userId ?? "").trim();
  if (!userId) return bad("userId required");

  await db.projectMembership.delete({
    where: { projectId_userId: { projectId: pid, userId } },
  });

  return NextResponse.json({ ok: true });
}
