// next.config.ts
import path from "path";

const nextConfig = {
  images: {
    domains: ["avatars.githubusercontent.com"],
    unoptimized: true, // ✅ Avoid image optimization for local PNGs
  },

  experimental: {
    appDir: true,
  },

  async rewrites() {
    // ✅ Allow direct access to your spectrograms from the server directory
    return [
      {
        source: "/frog-spectrograms/:path*", // Public URL pattern
        destination: "/Volumes/frog/frog-spectrograms/:path*", // Actual path on your server
      },
    ];
  },
};

export default nextConfig;
