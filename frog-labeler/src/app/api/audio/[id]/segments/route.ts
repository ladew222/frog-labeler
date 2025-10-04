// src/app/api/audio/[id]/segments/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

type ParamP = { params: Promise<{ id: string }> };

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/* -------- GET (list segments) -------- */
export async function GET(_req: Request, { params }: ParamP) {
  const { id } = await params;

  // Load audio to get its project for auth
  const audio = await db.audioFile.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!audio) return bad("Audio not found", 404);

  const { user } = await getSessionOrThrow();
  await requireProjectRole(user.id, audio.projectId, "VIEWER");

  const segs = await db.segment.findMany({
    where: { audioId: id },
    include: {
      label: { select: { id: true, name: true, color: true, hotkey: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startS: "asc" },
  });

  return NextResponse.json(segs);
}

/* -------- POST (create segment) -------- */
export async function POST(req: Request, { params }: ParamP) {
  const { id } = await params;

  const { user } = await getSessionOrThrow();

  const {
    startS,
    endS,
    labelId,
    individuals,
    callingRate,
    quality,
    notes,
    confidence,
  } = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (!(id && typeof startS === "number" && typeof endS === "number" && typeof labelId === "string")) {
    return bad("Missing required fields");
  }

  // Load audio + label and verify same project
  const [audio, label] = await Promise.all([
    db.audioFile.findUnique({ where: { id }, select: { id: true, projectId: true } }),
    db.label.findUnique({ where: { id: labelId }, select: { id: true, projectId: true } }),
  ]);
  if (!audio) return bad("Audio not found", 404);
  if (!label) return bad("Label not found", 404);
  if (label.projectId !== audio.projectId) return bad("Label not in the same project", 400);

  // Auth: must be able to modify this project's data
  await requireProjectRole(user.id, audio.projectId, "MEMBER");

  const seg = await db.segment.create({
    data: {
      audioId: id,
      startS,
      endS,
      labelId,
      individuals: typeof individuals === "number" ? (individuals as number) : undefined,
      callingRate: typeof callingRate === "number" ? (callingRate as number) : undefined,
      quality: typeof quality === "string" && quality.trim() ? (quality as string) : undefined,
      notes: typeof notes === "string" && notes.trim() ? (notes as string) : undefined,
      confidence: typeof confidence === "number" ? (confidence as number) : undefined,
      createdById: user.id,
    },
    include: {
      label: { select: { id: true, name: true, color: true, hotkey: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  // bump lastModifiedAt for this audio file
  await db.audioFile.update({
    where: { id },
    data: { lastModifiedAt: new Date() },
  });

  return NextResponse.json(seg, { status: 201 });
}
