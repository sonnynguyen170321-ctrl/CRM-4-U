import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  // `@aws-sdk/client-kms` is an OPTIONAL, lazily-imported dependency in lib/crypto.ts
  // (only loaded when KMS_KEY_ARN is set in production). Keep it out of the bundle so
  // the large AWS SDK is required at runtime rather than bundled into the function.
  // (The "module not found" dev warning is silenced at the import site via a
  // turbopackIgnore magic comment in lib/crypto.ts.)
  serverExternalPackages: ['@aws-sdk/client-kms'],
  // Tree-shake large barrel imports so only the icons/charts actually used ship
  // to the client, rather than the entire library surface.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
