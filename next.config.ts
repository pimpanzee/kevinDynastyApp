import type { NextConfig } from 'next';

/**
 * Built as a static export so it can be served from GitHub Pages. MFL is read
 * at build time; the Pages workflow rebuilds on a schedule to keep it fresh.
 *
 * A project site lives under /<repo>, so the workflow passes that prefix in
 * PAGES_BASE_PATH. Locally it is empty and the app serves from the root.
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

/**
 * Identifies this build, so an installed app can tell when a newer one is
 * live (components/UpdateCheck.tsx). Unique per build, not per commit: the
 * scheduled rebuilds carry new data on the same code. Kept in the environment
 * so build workers that load this config again agree on it.
 */
const buildId = (process.env.GRIDLOCK_BUILD_ID ??= Date.now().toString(36));

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_ID: buildId },
  // Pages are generated in a single worker so every MFL request shares one
  // throttle (lib/mfl/client.ts); parallel workers would each burst the API.
  experimental: { cpus: 1 },
};

export default nextConfig;
