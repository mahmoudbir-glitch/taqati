import { resolve } from "node:path";
import type { NextConfig } from "next";

// The documented `.env` lives at the repository root, which Next does not read
// on its own. Variables that are already set (e.g. on Vercel) always win.
try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch {
  // Optional: deployments set the environment directly.
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
