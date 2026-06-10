import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone container for Cloud Run (SPEC §11).
  output: "standalone",
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
