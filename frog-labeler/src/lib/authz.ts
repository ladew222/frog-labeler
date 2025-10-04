// src/lib/authz.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type GlobalRole = "pending" | "user" | "admin";
export type ProjectRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const GLOBAL_ROLE_ORDER: GlobalRole[] = ["pending", "user", "admin"];

/** Check global role (non-throwing). */
export async function requireRole(min: GlobalRole) {
  const session = await getServerSession(authOptions);
  const role = ((session?.user as any)?.role ?? "pending") as GlobalRole;
  const ok = GLOBAL_ROLE_ORDER.indexOf(role) >= GLOBAL_ROLE_ORDER.indexOf(min);
  return { ok, role, session };
}

/** Throw if no session. */
export async function getSessionOrThrow() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

/** Site-admin only guard (throws on fail). */
export async function requireSiteAdmin(userId?: string) {
  const session = await getServerSession(authOptions);
  const id = userId ?? session?.user?.id;
  if (!id) throw new Error("Unauthorized");

  const u = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!u || u.role !== "admin") throw new Error("Forbidden");
  return "admin" as const;
}

/** Project helpers */
export async function getUserProjectIds(userId: string) {
  const mems = await db.projectMembership.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return mems.map((m) => m.projectId);
}

export async function getProjectRole(userId: string, projectId: string) {
  const m = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return (m?.role ?? null) as ProjectRole | null;
}

/** Project guard with global-admin bypass (throws on fail). */
export async function requireProjectRole(
  userId: string,
  projectId: string,
  min: ProjectRole = "VIEWER"
) {
  // Global admin can access any project
  const session = await getServerSession(authOptions);
  const globalRole = (session?.user as any)?.role ?? "pending";
  if (globalRole === "admin") return "OWNER" as ProjectRole;

  const ranks: Record<ProjectRole, number> = {
    VIEWER: 0,
    MEMBER: 1,
    ADMIN: 2,
    OWNER: 3,
  };

  const role = await getProjectRole(userId, projectId);
  if (!role || ranks[role] < ranks[min]) throw new Error("Forbidden");
  return role;
}
