
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
// reuse the existing Labels UI so we don't duplicate code
import LabelAdmin from "@/app/labels/ui/LabelAdmin";

export const dynamic = "force-dynamic";

export default async function AdminLabelsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "pending";
  if (role !== "admin") redirect("/"); // or redirect("/auth/signin")

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin · Labels</h1>
      <LabelAdmin />
    </main>
  );
}
