import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // ppr: true, // Disabled - requires Next.js canary
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
      {
        hostname: 'cdn.jsdelivr.net',
      },
      {
        hostname: 'logos.composio.dev',
      },
    ],
  },
};

export default nextConfig;
