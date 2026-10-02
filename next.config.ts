import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "mongodb"],
};

export default nextConfig;
