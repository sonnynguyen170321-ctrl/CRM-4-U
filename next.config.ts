import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  serverExternalPackages: ['@aws-sdk/client-kms'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

let config = nextConfig;

if (process.env.ANALYZE === 'true') {
  const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
  config = withBundleAnalyzer(config);
}

export default config;
