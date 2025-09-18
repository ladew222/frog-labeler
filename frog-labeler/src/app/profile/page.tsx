export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any | undefined;

  if (!user) {
    return (
      <main className="p-6">
        <p className="text-slate-700">You’re not signed in.</p>
        <Link href="/auth/signin" className="text-blue-600 underline">Sign in</Link>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <section className="border rounded p-4 flex items-center gap-4">
        {user.image ? (
          <Image src={user.image} alt="avatar" width={64} height={64} className="rounded-full border" />
        ) : (
          <div className="h-16 w-16 rounded-full border grid place-items-center text-lg bg-slate-50">
            {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="space-y-1">
          <div><span className="text-slate-500">Name:</span> {user.name ?? "—"}</div>
          <div><span className="text-slate-500">Email:</span> {user.email ?? "—"}</div>
          <div>
            <span className="text-slate-500">Role:</span>{" "}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {user.role ?? "pending"}
            </span>
          </div>
          <div className="text-xs text-slate-500">User ID: <code>{user.id}</code></div>
        </div>
      </section>

      <div className="text-sm text-slate-600">
        (In the future, you can add settings here—e.g., preferred hotkeys, theme, or profile name edits.)
      </div>
    </main>
  );
}
