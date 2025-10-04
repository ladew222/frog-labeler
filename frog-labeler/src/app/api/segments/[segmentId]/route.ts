import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { id: string }; // audioId

// CREATE segment
export async function POST(
  req: Request,
  ctx: { params: Promise<Params> }
) {
  const { id } = await ctx.params; // audioId
  const body = (await req.json()) ?? {};
  const { startS, endS, labelId } = body;

  if (!(id && typeof startS === "number" && typeof endS === "number" && labelId)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [audioOk, labelOk] = await Promise.all([
    db.audioFile.findUnique({ where: { id }, select: { id: true } }),
    db.label.findUnique({ where: { id: labelId }, select: { id: true } }),
  ]);
  if (!audioOk) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  if (!labelOk) return NextResponse.json({ error: "Label not found" }, { status: 400 });

  const seg = await db.segment.create({
    data: { audioId: id, startS, endS, labelId /*, createdById: userId */ },
  });

  await db.audioFile.update({ where: { id }, data: { lastModifiedAt: new Date() } });

  return NextResponse.json(seg, { status: 201 });
}

// UPDATE segment (expects { segmentId, ...fields })
export async function PATCH(
  req: Request,
  ctx: { params: Promise<Params> }
) {
  const { id } = await ctx.params; // audioId
  const body = (await req.json()) ?? {};
  const { segmentId, ...data } = body;

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
  }

  const seg = await db.segment.update({
    where: { id: segmentId },
    data, // e.g., { startS, endS, labelId, notes, ... }
  });

  await db.audioFile.update({ where: { id }, data: { lastModifiedAt: new Date() } });

  return NextResponse.json(seg, { status: 200 });
}

// DELETE segment (expects { segmentId })
export async function DELETE(
  req: Request,
  ctx: { params: Promise<Params> }
) {
  const { id } = await ctx.params; // audioId
  const body = (await req.json()) ?? {};
  const { segmentId } = body;

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
  }

  await db.segment.delete({ where: { id: segmentId } });

  await db.audioFile.update({ where: { id }, data: { lastModifiedAt: new Date() } });

  return NextResponse.json({ ok: true }, { status: 200 });
}
