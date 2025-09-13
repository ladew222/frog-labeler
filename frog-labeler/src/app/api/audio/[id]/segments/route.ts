export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

// GET /api/audio/:id/segments
export async function GET(_req: Request, { params }: Ctx) {
  const segments = await db.segment.findMany({
    where: { audioId: params.id },
    orderBy: { startS: "asc" },
    include: { label: true },
  });
  return NextResponse.json(segments);
}

// POST /api/audio/:id/segments
export async function POST(req: Request, { params }: Ctx) {
  const body = await req.json().catch(() => null) as
    | { startS?: number; endS?: number; labelId?: string }
    | null;

  const startS = body?.startS;
  const endS = body?.endS;
  const labelId = body?.labelId;

  if (
    typeof startS !== "number" ||
    typeof endS !== "number" ||
    !labelId ||
    !(endS > startS)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const seg = await db.segment.create({
    data: { audioId: params.id, startS, endS, labelId },
    include: { label: true },
  });

  return NextResponse.json(seg, { status: 201 });
}
