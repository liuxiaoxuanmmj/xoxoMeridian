function getLoginVisualImageSources() {
  const raw = process.env.LOGIN_VISUALS_IMAGE_SRC ?? "";
  return raw
    .split(/[\s,]+/)
    .map((source) => source.trim())
    .filter(Boolean)
    .filter((source) =>
      /^https:\/\/(\*\.)?[a-zA-Z0-9.-]+(?::\d+)?$/.test(source) ||
      /^http:\/\/localhost(?::\d+)?$/.test(source)
    );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"]
  },
  async headers() {
    const loginVisualImageSources = getLoginVisualImageSources();
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `img-src 'self' data: blob:${loginVisualImageSources.length > 0 ? ` ${loginVisualImageSources.join(" ")}` : ""}`,
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "form-action 'self'"
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp }
        ]
      }
    ];
  }
};

export default nextConfig;
