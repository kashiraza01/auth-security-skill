import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxy /api/* to the demo backend so the browser talks to one origin
  // (keeps cookies + CORS simple for the lab).
  async rewrites() {
    return [
      { source: "/proxy/:path*", destination: `${API_URL}/:path*` },
    ];
  },
};

export default nextConfig;
