const path = require("path");
const { loadEnvConfig } = require("@next/env");

// Load .env from apps/web so DATABASE_URL is available for Prisma (even when cwd is monorepo root)
loadEnvConfig(path.resolve(__dirname));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kharchapay/shared"],
  allowedDevHosts: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

module.exports = nextConfig;
