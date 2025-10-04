import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { user } = await getSessionOrThrow();
  const { projectId } = await ctx.params;

  // allow members+ to search; make this "ADMIN" if you want it stricter
  await requireProjectRole(user.id, projectId, "MEMBER");

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);

  // exclude users already in the project
  const existing = await db.projectMembership.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const exclude = existing.map(m => m.userId);

  const results = await db.user.findMany({
    where: {
      id: { notIn: exclude },
      OR: [
        { email: { contains: q } },   // no `mode` on SQLite
        { name:  { contains: q } },
      ],
    },
    take: 8,
    select: { id: true, name: true, email: true, image: true },
    orderBy: { email: "asc" },
  });

  return NextResponse.json(results);
}
