"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const user = session?.user as any | undefined;

  if (loading) {
    return <div className="text-sm text-slate-500">…</div>;
  }

  if (!user) {
    return (
      <button
        className="border rounded px-3 py-1 text-sm hover:bg-slate-50"
        onClick={() => signIn("github", { callbackUrl: "/" })}
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/profile" className="flex items-center gap-2 group">
        {/* avatar */}
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? user.email ?? "avatar"}
            className="h-7 w-7 rounded-full border"
          />
        ) : (
          <div className="h-7 w-7 rounded-full border grid place-items-center text-xs bg-slate-50">
            {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="text-sm">
          {user.name ?? user.email ?? "User"}
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {user.role ?? "pending"}
          </span>
        </span>
      </Link>

      <button
        className="border rounded px-3 py-1 text-sm hover:bg-slate-50"
        onClick={() => signOut({ callbackUrl: "/" })}
      >
        Sign out
      </button>
    </div>
  );
}
