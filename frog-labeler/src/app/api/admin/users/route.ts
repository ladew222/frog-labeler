export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz";

/**
 * GET /api/admin/users?q=...
 * Admin-only. Returns users + their project memberships.
 */
export async function GET(req: Request) {
  const { ok } = await requireRole("admin");
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  // Basic user list (filter by name/email if q provided)
  const users = await db.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { name:  { contains: q } },
          ],
        }
      : undefined,
    select: { id: true, name: true, email: true, image: true, role: true },
    orderBy: { email: "asc" },
    take: 200,
  });

  // Pull memberships and attach (keeps Prisma relation-name ambiguity out)
  const mems = await db.projectMembership.findMany({
    where: { userId: { in: users.map(u => u.id) } },
    select: {
      userId: true,
      role: true,
      project: { select: { id: true, name: true } },
    },
  });
  const byUser = new Map<string, any[]>();
  for (const m of mems) {
    if (!byUser.has(m.userId)) byUser.set(m.userId, []);
    byUser.get(m.userId)!.push({ projectId: m.project.id, projectName: m.project.name, role: m.role });
  }

  const result = users.map(u => ({
    ...u,
    memberships: byUser.get(u.id) ?? [],
  }));

  return NextResponse.json(result);
}
