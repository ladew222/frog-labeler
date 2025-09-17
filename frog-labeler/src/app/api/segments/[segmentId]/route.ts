// src/app/api/segments/[segmentId]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

type Params = { params: { segmentId: string } };

export async function DELETE(_: Request, { params }: Params) {
  const { ok, role } = await requireRole("user");
  if (!ok) {
    return NextResponse.json(
      { error: `Access denied for role: ${role}` },
      { status: 403 }
    );
  }

  const { segmentId } = params;

  try {
    await db.segment.delete({ where: { id: segmentId } });
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.error("Segment deletion failed:", e);
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 400 });
  }
}
