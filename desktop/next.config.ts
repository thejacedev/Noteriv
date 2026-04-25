import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri loads from `out/` after `next build`. Asset prefix matches Tauri default.
  assetPrefix: process.env.NODE_ENV === "production" ? "" : undefined,
};

export default nextConfig;
