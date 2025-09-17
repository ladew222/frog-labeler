// src/app/api/admin/users/[id]/role/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { role } = await req.json(); // "pending" | "user" | "admin"
  if (!["pending", "user", "admin"].includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  await db.user.update({ where: { id: params.id }, data: { role } });
  return NextResponse.json({ ok: true });
}
