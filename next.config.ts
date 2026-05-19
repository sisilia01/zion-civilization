import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["142.132.189.45"],
  images: {
    domains: [
      "polymarket-upload.s3.us-east-2.amazonaws.com",
      "cryptologos.cc",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "polymarket-upload.s3.us-east-2.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cryptologos.cc",
        pathname: "/logos/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data: https://polymarket-upload.s3.us-east-2.amazonaws.com https://cryptologos.cc;",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
