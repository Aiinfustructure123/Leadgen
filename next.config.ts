import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["jsforce", "@prisma/client", "prisma"],
};

export default nextConfig;
