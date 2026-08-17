import type { NextConfig } from "next";
import packageInfo from "./package.json";

const buildCommit = process.env.KIROMAIL_BUILD_COMMIT?.trim() || "local";
const buildDate =
  process.env.KIROMAIL_BUILD_DATE?.trim() || new Date().toISOString();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_KIROMAIL_VERSION: packageInfo.version,
    NEXT_PUBLIC_KIROMAIL_COMMIT: buildCommit,
    NEXT_PUBLIC_KIROMAIL_BUILD_DATE: buildDate,
  },
};

export default nextConfig;
