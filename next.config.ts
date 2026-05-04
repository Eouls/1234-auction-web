import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  reactCompiler: true,
  serverExternalPackages: ["tesseract.js", "sharp"],
};

export default nextConfig;
