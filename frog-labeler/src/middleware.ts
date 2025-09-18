// src/middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ token, req }) {
      const path = req.nextUrl.pathname;

      // Public routes
      if (
        path === "/" ||
        path.startsWith("/auth") ||
        path.startsWith("/api/health")
      ) {
        return true;
      }

      // Admin-only pages & APIs
      if (path.startsWith("/labels")) return !!token && token.role === "admin";
      if (path.startsWith("/api/admin")) return !!token && token.role === "admin";

      // Authenticated (user or admin)
      if (path.startsWith("/annotate")) return !!token && (token.role === "user" || token.role === "admin");
      if (path.startsWith("/api/audio")) return !!token && (token.role === "user" || token.role === "admin");
      if (path.startsWith("/api/segments")) return !!token && (token.role === "user" || token.role === "admin");

      // Everything else requires login
      return !!token;
    },
  },
});

export const config = {
  matcher: [
    "/annotate/:path*",
    "/labels/:path*",
    "/api/audio/:path*",
    "/api/segments/:path*",
    "/api/admin/:path*",   // ⬅️ add this for the ingest route
    // add more protected paths if needed
  ],
};
