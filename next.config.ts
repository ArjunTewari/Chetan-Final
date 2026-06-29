import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['axios', '@anthropic-ai/sdk'],
};

export default nextConfig;
