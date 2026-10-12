import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Opening the app from another device (same Wi-Fi, or a VPN like Tailscale)
// needs that address allowed. This computer's own addresses are allowed;
// add others, comma-separated, as JOBFLOW_DEV_ORIGINS in web/.env.local.
const ownAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === "IPv4" && !address.internal)
  .map((address) => address!.address);
const extraOrigins = (process.env.JOBFLOW_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...ownAddresses, ...extraOrigins],
  experimental: {
    // CV uploads on the Setup screen (10 MB plus form overhead).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
