import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // KB editor accepts document uploads (PDF/DOCX/MD). 1MB default is too tight.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
