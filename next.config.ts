import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const nextConfig: NextConfig = {
  /**
   * Do NOT set `env: { NEXT_PUBLIC_* }` here with values read at config-eval time.
   * Empty strings get baked into the Edge middleware bundle and override Vercel’s
   * real environment variables → MIDDLEWARE_INVOCATION_FAILED on deploy.
   * Next injects `NEXT_PUBLIC_*` from the environment at build time automatically.
   */
};

export default nextConfig;
