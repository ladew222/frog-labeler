// next-auth.d.ts
import NextAuth, { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;     // your DB id
      role: string;   // "pending" | "user" | "admin" (whatever you use)
    };
  }

  interface User extends DefaultUser {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}
