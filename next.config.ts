import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo (npm run demo) builds into its own folder, so it can run next to
  // the normal dev server without the two fighting over .next.
  // No dev badge in the corner either, since the demo is for screen recordings.
  ...(process.env.ORDERLY_DEMO === "1" ? { distDir: ".next-demo", devIndicators: false } : {}),
};

export default nextConfig;
