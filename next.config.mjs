/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
  }
};

export default nextConfig;
