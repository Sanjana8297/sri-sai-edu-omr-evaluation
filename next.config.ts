import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Keep short so replacing files under /public/images refreshes promptly.
    minimumCacheTTL: 60,
  },
  experimental: {
    optimizePackageImports: ["@tanstack/react-query", "@tanstack/react-virtual"],
  },
};

export default nextConfig;
