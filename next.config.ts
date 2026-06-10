import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
  },
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
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
      },
      {
        protocol: "https",
        hostname: "s2.coinmarketcap.com",
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data: https://polymarket-upload.s3.us-east-2.amazonaws.com https://cryptologos.cc https://cdn.prod.website-files.com https://assets.coingecko.com https://s2.coinmarketcap.com https://raw.githubusercontent.com https://upload.wikimedia.org https://cdn-icons-png.flaticon.com;",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/zion-markets/:path*",
        destination: "http://localhost:8000/api/zion-markets/:path*",
      },
      {
        source: "/api/zion-markets",
        destination: "http://localhost:8000/api/zion-markets",
      },
      {
        source: "/api/ai-governance/battle",
        destination: "http://localhost:8000/api/ai-governance/battle",
      },
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
      {
        source: "/zk-stealth-batch-claim",
        destination: "http://localhost:8000/zk-stealth-batch-claim",
      },
      { source: "/conversations", destination: "http://localhost:8000/conversations" },
      { source: "/police-wire", destination: "http://localhost:8000/police-wire" },
      { source: "/corporate-wire", destination: "http://localhost:8000/corporate-wire" },
      { source: "/clan-wire", destination: "http://localhost:8000/clan-wire" },
      { source: "/senate", destination: "http://localhost:8000/senate" },
      { source: "/political_parties", destination: "http://localhost:8000/political_parties" },
      { source: "/vip_memory", destination: "http://localhost:8000/vip_memory" },
    ];
  },
};

export default nextConfig;
