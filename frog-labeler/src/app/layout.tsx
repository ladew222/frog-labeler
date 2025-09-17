// src/app/layout.tsx
import "./globals.css";
import AuthSessionProvider from "@/components/SessionProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>
          <div className="min-h-screen flex flex-col">
            <main className="flex-grow">{children}</main>

            {/* 👇 Footer branding */}
            <footer className="bg-slate-100 text-center text-sm text-slate-600 py-3 border-t">
              🐸 Frog Labeler &mdash; Built at Viterbo CS
            </footer>
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
