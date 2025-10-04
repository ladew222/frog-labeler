"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full border rounded p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in to request access</h1>
        <p className="text-sm text-slate-600">
          Signing in will create your account with a temporary <b>pending</b> role.
          An admin will approve you and assign projects.
        </p>

        <div className="space-y-2">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full border rounded px-3 py-2 hover:bg-slate-50"
          >
            Continue with Google
          </button>
          <button
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="w-full border rounded px-3 py-2 hover:bg-slate-50"
          >
            Continue with GitHub
          </button>
        </div>

        <p className="text-xs text-slate-500">
          After you sign in, an admin can promote your account on the Admin → Users page.
        </p>
      </div>
    </main>
  );
}
