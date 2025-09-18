// src/app/api/audio/[id]/segments/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Keep this Promise-based context — it avoids the “await params” warning
type CtxPromise = Promise<{ params: { id: string } }>;

export async function GET(_req: Request, ctx: CtxPromise) {
  const { params } = await ctx;
  const segs = await db.segment.findMany({
    where: { audioId: params.id },
    include: {
      label: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startS: "asc" },
  });
  return NextResponse.json(segs);
}

export async function POST(req: Request, ctx: CtxPromise) {
  const { params } = await ctx;

  // ✅ must be signed in to create a segment
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const {
    startS,
    endS,
    labelId,
    individuals,
    callingRate,
    quality,
    notes,
    confidence,
  } = (await req.json()) ?? {};

  if (!(params.id && typeof startS === "number" && typeof endS === "number" && labelId)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // (Optional but nicer errors than P2003)
  const [audioOk, labelOk] = await Promise.all([
    db.audioFile.findUnique({ where: { id: params.id }, select: { id: true } }),
    db.label.findUnique({ where: { id: labelId }, select: { id: true } }),
  ]);
  if (!audioOk) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  if (!labelOk) return NextResponse.json({ error: "Label not found" }, { status: 400 });

  const seg = await db.segment.create({
    data: {
      audioId: params.id,
      startS,
      endS,
      labelId,
      // optional fields
      individuals: typeof individuals === "number" ? individuals : undefined,
      callingRate: typeof callingRate === "number" ? callingRate : undefined,
      quality: typeof quality === "string" && quality.trim() ? quality : undefined,
      notes: typeof notes === "string" && notes.trim() ? notes : undefined,
      confidence: typeof confidence === "number" ? confidence : undefined,
      // 👇 audit
      createdById: userId,
    },
    include: {
      label: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(seg, { status: 201 });
}
