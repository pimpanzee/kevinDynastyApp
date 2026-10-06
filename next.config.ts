import type { NextConfig } from 'next';

/**
 * Built as a static export so it can be served from GitHub Pages. MFL is read
 * at build time; the Pages workflow rebuilds on a schedule to keep it fresh.
 *
 * A project site lives under /<repo>, so the workflow passes that prefix in
 * PAGES_BASE_PATH. Locally it is empty and the app serves from the root.
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Pages are generated in a single worker so every MFL request shares one
  // throttle (lib/mfl/client.ts); parallel workers would each burst the API.
  experimental: { cpus: 1 },
};

export default nextConfig;
