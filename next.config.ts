import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: {
    '/api/gmail/sync': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/gmail/backfill': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
