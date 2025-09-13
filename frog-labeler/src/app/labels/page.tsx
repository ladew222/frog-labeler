import Link from "next/link";
import LabelAdmin from "./ui/LabelAdmin";
export const dynamic = "force-dynamic";

export default function LabelsPage() {
  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Labels Admin</h1>
        <Link href="/" className="text-blue-600 underline">← Back</Link>
      </div>
      <LabelAdmin />
    </main>
  );
}
