import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminUsers from "./ui/AdminUsers";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "pending";
  if (role !== "admin") redirect("/");

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin · Users & Projects</h1>
      <AdminUsers />
    </main>
  );
}
