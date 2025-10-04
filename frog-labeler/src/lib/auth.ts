import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: "read:user user:email" } },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  debug: true,
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, copy role/id from the DB user
      if (user) {
        token.sub = user.id;
        token.role = (user as any).role ?? "pending";
        return token;
      }

      // On subsequent requests, refresh the role from DB (honors admin demotions/promotions)
      if (token.sub) {
        try {
          const u = await db.user.findUnique({
            where: { id: token.sub as string },
            select: { role: true },
          });
          if (u) token.role = (u.role as any) ?? token.role ?? "pending";
        } catch {
          // If the DB check fails, keep whatever is already on the token
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub as string;
        (session.user as any).role = (token as any).role ?? "pending";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET!,
};
