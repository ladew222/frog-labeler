// src/app/api/segments/[segmentId]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: { segmentId: string } };

export async function DELETE(_: Request, { params }: Params) {
  const { segmentId } = params;
  try {
    await db.segment.delete({ where: { id: segmentId } });
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 400 });
  }
}
