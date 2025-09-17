// src/app/annotate/[audioId]/page.tsx
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import Annotator from "./Annotator";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ audioId: string }>;
}) {
  // ✅ await params for dynamic routes
  const { audioId } = await params;

  // Require the "user" role (user or admin allowed)
  const { ok, role } = await requireRole("user");
  if (!ok) {
    console.warn("Blocked annotate access for role:", role);
    redirect("/pending");
  }

  return <Annotator audioId={audioId} />;
}
