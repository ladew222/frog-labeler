import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ token, req }) {
      const path = req.nextUrl.pathname;

      // Public paths:
      if (
        path === "/" ||
        path.startsWith("/auth") ||
        path.startsWith("/api/health")
      ) {
        return true;
      }

      // Require login for annotate + labels
      if (path.startsWith("/annotate")) {
        return !!token && (token.role === "user" || token.role === "admin");
      }

      if (path.startsWith("/labels")) {
        return !!token && token.role === "admin";
      }

      // APIs that should only be available to logged-in users
      if (path.startsWith("/api/audio") || path.startsWith("/api/segments")) {
        return !!token && (token.role === "user" || token.role === "admin");
      }

      return !!token; // default: logged-in
    },
  },
});

export const config = {
  matcher: [
    "/annotate/:path*",
    "/labels/:path*",
    "/api/audio/:path*",
    "/api/segments/:path*",
    // add more if needed
  ],
};
