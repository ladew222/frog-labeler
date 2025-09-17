"use client";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <button className="border px-3 py-1 rounded" onClick={() => signIn("github")}>
        Continue with GitHub
      </button>
    </main>
  );
}
