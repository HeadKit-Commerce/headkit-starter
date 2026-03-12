import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@headkit/sdk"],
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  images: {
    qualities: [50, 75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.IMAGE_DOMAIN ?? "",
      },
    ],
  },
};

export default nextConfig;
