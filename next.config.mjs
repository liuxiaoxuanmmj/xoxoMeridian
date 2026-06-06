/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"]
  }
};

export default nextConfig;
