// src/app/api/segments/[segmentId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { segmentId: string };

/* --------------------------- UPDATE (PUT) --------------------------- */
export async function PUT(
  req: Request,
  ctx: { params: Promise<Params> } // Next 15: params is a Promise
) {
  const { segmentId } = await ctx.params;

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
  }

  const body = await req.json();

  // Build update payload only with provided fields (avoid overwriting with undefined)
  const data: any = {};
  if (typeof body.startS === "number") data.startS = body.startS;
  if (typeof body.endS === "number") data.endS = body.endS;

  if (body.hasOwnProperty("individuals"))
    data.individuals = body.individuals === "" ? null : Number(body.individuals);
  if (body.hasOwnProperty("callingRate"))
    data.callingRate = body.callingRate === "" ? null : Number(body.callingRate);
  if (body.hasOwnProperty("quality"))
    data.quality = (body.quality ?? "").trim() ? body.quality : null;
  if (body.hasOwnProperty("notes"))
    data.notes = (body.notes ?? "").trim() ? body.notes : null;
  if (body.hasOwnProperty("confidence"))
    data.confidence =
      body.confidence === "" || body.confidence == null ? null : Number(body.confidence);

  // Allow label change
  if (body.labelId) {
    data.label = { connect: { id: String(body.labelId) } };
  }

  try {
    // Update the segment
    const updated = await db.segment.update({
      where: { id: segmentId },
      data,
      include: {
        label: { select: { id: true, name: true, color: true, hotkey: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        audio: { select: { id: true } },
      },
    });

    // Touch audio's last-modified timestamp if your schema has it
    try {
      await db.audioFile.update({
        where: { id: updated.audio.id },
        data: { lastModifiedAt: new Date() },
      });
    } catch {
      // ignore if your schema doesn't have lastModifiedAt
    }

    // Return updated segment (shape expected by your Annotator.tsx)
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }
    console.error("PUT /api/segments/:segmentId failed:", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/* -------------------------- DELETE (existing) -------------------------- */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<Params> } // Next 15: params is a Promise
) {
  const { segmentId } = await ctx.params;

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
  }

  // Grab the segment to verify and to update its audio's timestamp
  const seg = await db.segment.findUnique({
    where: { id: segmentId },
    select: { id: true, audioId: true },
  });

  if (!seg) {
    // idempotent delete
    return new NextResponse(null, { status: 204 });
  }

  await db.segment.delete({ where: { id: segmentId } });

  try {
    await db.audioFile.update({
      where: { id: seg.audioId },
      data: { lastModifiedAt: new Date() },
    });
  } catch {
    // ignore if field doesn't exist
  }

  return new NextResponse(null, { status: 204 });
}
