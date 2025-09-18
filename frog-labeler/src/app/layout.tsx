import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import SessionProvider from "@/components/SessionProvider";
import UserMenu from "@/components/UserMenu";

export const metadata: Metadata = {
  title: "Frog Labeler",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
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
                </nav>
              </div>
              <UserMenu />
            </div>
          </header>

          <div className="px-4">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
