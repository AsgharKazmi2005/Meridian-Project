import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Next/Turbopack scoped to this repository even when a parent folder
  // contains another lockfile (as on some local machines and CI runners).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
