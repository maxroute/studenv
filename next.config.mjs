/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  compress: false,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["nodemailer"],
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self)",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
