import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Logo and cover images are saved with the wizard as downscaled data URLs.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
