import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  reactCompiler: true,
  serverExternalPackages: ["@sparticuz/chromium", "playwright", "playwright-core", "tesseract.js", "sharp"],
};

export default nextConfig;
