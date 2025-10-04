// src/app/api/segments/[segmentId]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

type ParamP = { params: Promise<{ segmentId: string }> };

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

// Helper to auth on the segment's project
async function assertCanEdit(userId: string, segmentId: string, min: "MEMBER" | "VIEWER" = "MEMBER") {
  const seg = await db.segment.findUnique({
    where: { id: segmentId },
    select: { audio: { select: { projectId: true } } },
  });
  if (!seg) throw Object.assign(new Error("Not found"), { code: 404 });
  await requireProjectRole(userId, seg.audio.projectId, min);
}

export async function PUT(req: Request, { params }: ParamP) {
  const { segmentId } = await params;
  const { user } = await getSessionOrThrow();

  await assertCanEdit(user.id, segmentId, "MEMBER");

  const body = (await req.json().catch(() => ({}))) as any;

  const updated = await db.segment.update({
    where: { id: segmentId },
    data: {
      labelId: typeof body.labelId === "string" ? body.labelId : undefined,
      individuals: typeof body.individuals === "number" ? body.individuals : body.individuals === null ? null : undefined,
      callingRate: typeof body.callingRate === "number" ? body.callingRate : body.callingRate === null ? null : undefined,
      quality: typeof body.quality === "string" ? body.quality : body.quality === null ? null : undefined,
      notes: typeof body.notes === "string" ? body.notes : body.notes === null ? null : undefined,
      confidence: typeof body.confidence === "number" ? body.confidence : body.confidence === null ? null : undefined,
      updatedById: user.id,
    },
    include: {
      label: { select: { id: true, name: true, color: true, hotkey: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      audio: { select: { id: true } },
    },
  });

  // bump lastModifiedAt
  await db.audioFile.update({
    where: { id: updated.audio.id },
    data: { lastModifiedAt: new Date() },
  });

  // strip the nested audio before returning
  // (UI doesn't need it)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { audio, ...rest } = updated as any;
  return NextResponse.json(rest);
}

export async function DELETE(_req: Request, { params }: ParamP) {
  const { segmentId } = await params;
  const { user } = await getSessionOrThrow();

  // find audio to bump lastModifiedAt after delete
  const seg = await db.segment.findUnique({
    where: { id: segmentId },
    select: { audioId: true, audio: { select: { projectId: true } } },
  });
  if (!seg) return bad("Not found", 404);

  await requireProjectRole(user.id, seg.audio.projectId, "MEMBER");

  await db.segment.delete({ where: { id: segmentId } });
  await db.audioFile.update({ where: { id: seg.audioId }, data: { lastModifiedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
