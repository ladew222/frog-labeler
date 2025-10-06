// src/app/api/segments/[segmentId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { segmentId: string };

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<Params> }         // Next 15: params is a Promise
) {
  const { segmentId } = await ctx.params;

  if (!segmentId) {
    return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
  }

  // Grab the segment to (a) verify it exists and (b) update its audio's timestamp.
  const seg = await db.segment.findUnique({
    where: { id: segmentId },
    select: { id: true, audioId: true },
  });

  if (!seg) {
    // It's fine to treat “already gone” as success for idempotency.
    return new NextResponse(null, { status: 204 });
  }

  await db.segment.delete({ where: { id: segmentId } });
  await db.audioFile.update({
    where: { id: seg.audioId },
    data: { lastModifiedAt: new Date() },
  });

  // No body so clients that call res.json() won’t choke
  return new NextResponse(null, { status: 204 });
}
