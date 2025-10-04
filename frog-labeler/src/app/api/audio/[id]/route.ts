export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/authz";

type Ctx = { params: { id: string } };

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/**
 * GET /api/audio/:id
 * Returns { id, originalName, uri, recordedAt, projectId }
 * – Auth: signed-in user must have VIEWER+ on the file's project (admins bypass).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return bad("Unauthenticated", 401);

  const id = params?.id;
  if (!id) return bad("Missing id");

  const audio = await db.audioFile.findUnique({
    where: { id },
    select: {
      id: true,
      originalName: true,
      uri: true,
      recordedAt: true,
      projectId: true,
    },
  });
  if (!audio) return bad("Not found", 404);

  // Enforce project access (global admin bypass is inside requireProjectRole)
  await requireProjectRole(session.user.id, audio.projectId, "VIEWER");

  return NextResponse.json(audio);
}
