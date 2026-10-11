import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CV uploads on the Setup screen (10 MB plus form overhead).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
