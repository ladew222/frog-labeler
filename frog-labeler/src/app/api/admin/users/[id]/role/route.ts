// src/app/api/admin/users/[id]/role/route.ts
export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params; // 👈 Next 15: params is a Promise
  const body = await req.json();
  const role = body?.role as string;

  if (!["pending", "user", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await db.user.update({ where: { id }, data: { role } });
  return NextResponse.json({ ok: true });
}
