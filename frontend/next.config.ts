import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.INTERNAL_BACKEND_URL || 'http://127.0.0.1:8000'}/:path*`
      }
    ];
  }
};

export default nextConfig;
