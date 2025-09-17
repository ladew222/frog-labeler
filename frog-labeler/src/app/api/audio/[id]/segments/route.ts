// src/app/api/audio/[id]/segments/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Next.js dynamic params must be awaited in app routes
type CtxPromise = Promise<{ params: { id: string } }>;

export async function GET(_req: Request, ctx: CtxPromise) {
  const { params } = await ctx;
  const segs = await db.segment.findMany({
    where: { audioId: params.id },
    include: { label: true },
    orderBy: { startS: "asc" },
  });
  return NextResponse.json(segs);
}

export async function POST(req: Request, ctx: CtxPromise) {
  const { params } = await ctx;
  const body = await req.json();
  const {
    startS,
    endS,
    labelId,
    // optional annotation fields
    individuals,
    callingRate,
    quality,
    notes,
    confidence,
  } = body ?? {};

  if (!(params.id && typeof startS === "number" && typeof endS === "number" && labelId)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const seg = await db.segment.create({
    data: {
      audioId: params.id,
      startS,
      endS,
      labelId,
      individuals: typeof individuals === "number" ? individuals : undefined,
      callingRate: typeof callingRate === "number" ? callingRate : undefined,
      quality: typeof quality === "string" && quality.trim() ? quality : undefined,
      notes: typeof notes === "string" && notes.trim() ? notes : undefined,
      confidence: typeof confidence === "number" ? confidence : undefined,
    },
    include: { label: true },
  });

  return NextResponse.json(seg, { status: 201 });
}
