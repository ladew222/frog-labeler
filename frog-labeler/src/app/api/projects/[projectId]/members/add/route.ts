import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

// POST /api/projects/[projectId]/members
// Body: { email: string, role?: "MEMBER" | "ADMIN" }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }   // 👈 new async params signature
) {
  // ✅ Await params (Next.js 15 changed this)
  const { projectId } = await context.params;

  try {
    const { user } = await getSessionOrThrow();
    const requesterRole = await requireProjectRole(user.id, projectId, "ADMIN");

    const body = await req.json().catch(() => ({}));
    let email = (body?.email ?? "").toString().trim().toLowerCase();
    let role = (body?.role as "MEMBER" | "ADMIN" | undefined) ?? "MEMBER";

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Only an OWNER can grant ADMIN; everyone else is forced to MEMBER
    if (role === "ADMIN" && requesterRole !== "OWNER") role = "MEMBER";

    // Ensure project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const invitee = await db.user.findUnique({ where: { email } });
    if (!invitee)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check if already a member
    const already = await db.projectMembership.findUnique({
      where: {
        projectId_userId: { projectId, userId: invitee.id },
      },
      select: { id: true },
    });

    const membership = await db.projectMembership.upsert({
      where: {
        projectId_userId: { projectId, userId: invitee.id },
      },
      update: { role },
      create: { projectId, userId: invitee.id, role },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json({ ok: true, membership }, { status: already ? 200 : 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg.includes("Unauthorized") ? 401 :
      msg.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
