// src/lib/auth.ts
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      // make sure we request emails
      authorization: { params: { scope: "read:user user:email" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  debug: true, // ← log detailed NextAuth info to your server console
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // keep role + ensure token has the user id (sub)
        token.role = (user as any).role ?? "pending";
        token.sub = user.id; // critical: persist id to the JWT
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role ?? "pending";
        // critical: expose id to the client/server
        (session.user as any).id = token.sub as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET!,
};
