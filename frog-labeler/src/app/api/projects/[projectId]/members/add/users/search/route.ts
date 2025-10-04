export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  // must be project ADMIN/OWNER to search users for this project
  const { user } = await getSessionOrThrow();
  await requireProjectRole(user.id, params.projectId, "ADMIN");

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]); // empty query -> empty list

  // users already in the project
  const existing = await db.projectMembership.findMany({
    where: { projectId: params.projectId },
    select: { userId: true },
  });
  const excludeIds = existing.map((m) => m.userId);

  const users = await db.user.findMany({
    where: {
      id: { notIn: excludeIds },
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name:  { contains: q, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, image: true },
  });

  return NextResponse.json(users);
}
