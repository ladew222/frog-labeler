export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow } from "@/lib/authz";

export async function GET(req: Request) {
  const { user } = await getSessionOrThrow();
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "mine";

  const isAdmin = (user as any).role === "admin";

  // Admin: return ALL projects for pick-lists on the admin page
  if (isAdmin && scope === "all") {
    const projects = await db.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(projects);
  }

  // Default: only projects current user belongs to (+ include their membership role)
  const mems = await db.projectMembership.findMany({
    where: { userId: user.id },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { project: { name: "asc" } },
  });

  return NextResponse.json(
    mems.map((m) => ({ id: m.project.id, name: m.project.name, role: m.role }))
  );
}
