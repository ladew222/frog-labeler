export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

type P = { params: Promise<{ id: string }> };
const ROLES = new Set(["pending", "user", "admin"]);

export async function PUT(req: Request, { params }: P) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const role = String(body?.role || "");

  if (!ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Prevent demoting the last admin
  if (target.role === "admin" && role !== "admin") {
    const otherAdmins = await db.user.count({ where: { role: "admin", NOT: { id } } });
    if (otherAdmins === 0) {
      return NextResponse.json({ error: "Cannot demote the last admin" }, { status: 400 });
    }
  }

  const updated = await db.user.update({ where: { id }, data: { role } });
  return NextResponse.json({ ok: true, id: updated.id, role: updated.role });
}
