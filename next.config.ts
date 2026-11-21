import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["simple-git"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      config.externals = [...externals, "node:sqlite"];
    }
    return config;
  },
};

export default nextConfig;
