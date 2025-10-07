// src/app/layout.tsx
export const dynamic = "force-dynamic"; // ensure session isn't cached

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SessionProvider from "@/components/SessionProvider";
import UserMenu from "@/components/UserMenu";

export const metadata: Metadata = {
  title: "Frog Labeler",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "pending";

  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        {/* pass the server session down so client hooks are instant */}
        <SessionProvider session={session}>
          {/* Top toolbar */}
          <header className="border-b bg-white">
            <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-lg font-semibold">
                  🐸 Frog Labeler
                </Link>

                <nav className="hidden md:flex items-center gap-3 text-sm">
                  <Link href="/" className="text-slate-700 hover:underline">Home</Link>
                  <Link href="/labels" className="text-slate-700 hover:underline">Labels</Link>

                  {/* Admin-only links */}
                  {role === "admin" && (
                    <>
                      <Link href="/admin/users" className="text-blue-600 hover:underline">
                        Admin · Users
                      </Link>
                      <Link href="/admin/labels" className="text-blue-600 hover:underline">
                        Admin · Labels
                      </Link>
                    </>
                  )}
                </nav>
              </div>

              <UserMenu />
            </div>
          </header>

          {/* Main content */}
          <main className="flex-grow px-4">{children}</main>

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-3 px-6 pb-6">
            <div>
              Created in cooperation with{" "}
              <span className="font-semibold">Viterbo Computer Science</span>
            </div>
            <img
              src="viterbo_horiz_rgb.jpg"
              alt="Viterbo University logo"
              className="h-10 w-auto"
            />
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
