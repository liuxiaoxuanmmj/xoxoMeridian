/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "ali-oss", "prisma"],
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
  }
};

export default nextConfig;
