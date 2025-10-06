export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectRole } from "@/lib/authz";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/**
 * GET /api/audio/:id
 * Returns { id, originalName, uri, recordedAt, projectId } 
 * – Auth: signed-in user must have VIEWER+ on the file's project (admins bypass).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // 🆕 awaitable params
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return bad("Unauthenticated", 401);

  const { id } = await ctx.params; // ✅ await the params object
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

  await requireProjectRole(session.user.id, audio.projectId, "VIEWER");

  return NextResponse.json(audio);
}
