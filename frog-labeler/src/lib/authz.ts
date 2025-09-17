// src/lib/authz.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireRole(min: "user" | "admin") {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "pending";
  const ok =
    (min === "user" && (role === "user" || role === "admin")) ||
    (min === "admin" && role === "admin");
  return { ok, role, session };
}
