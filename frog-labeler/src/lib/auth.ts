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
    }),
  ],
  // Use JWT so middleware can read the role without hitting the DB
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" }, // (optional) custom sign-in page
  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in, `user` is defined — copy its role to the token
      if (user) token.role = (user as any).role ?? "pending";
      return token;
    },
    async session({ session, token }) {
      // Expose role on the client
      if (session.user) (session.user as any).role = token.role ?? "pending";
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET!,
};
