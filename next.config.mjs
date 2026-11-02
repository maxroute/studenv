/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  compress: false,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["nodemailer", "argon2"],
    outputFileTracingIncludes: {
      "/*": [
        "./node_modules/argon2/prebuilds/linux-x64/argon2.glibc.node",
      ],
    },
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
