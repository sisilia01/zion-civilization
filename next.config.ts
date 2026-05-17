import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["142.132.189.45"],
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
