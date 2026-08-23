import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@egi/shared-types"],
  async headers() {
    const shellRoutes = [
      "/",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/dashboard",
      "/tasks",
      "/me/work",
      "/projects",
      "/user-stories",
      "/incidents",
      "/admin/users",
      "/admin/websites",
      "/admin/assignments",
      "/pic-web/tickets",
      "/tickets",
      "/team",
    ];
    return [
      ...shellRoutes.map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=10, stale-while-revalidate=60",
          },
        ],
      })),
      { source: "/projects/:path*", headers: shellCacheHeaders() },
      { source: "/incidents/:path*", headers: shellCacheHeaders() },
      { source: "/websites/:path*", headers: shellCacheHeaders() },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

function shellCacheHeaders() {
  return [
    {
      key: "Cache-Control",
      value: "private, max-age=10, stale-while-revalidate=60",
    },
  ];
}

export default nextConfig;
