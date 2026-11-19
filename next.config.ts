import path from "node:path";
import type { NextConfig } from "next";
import { assertEnv, isStrict } from "./lib/env";

// Fail the BUILD with a clear message when a hosted environment is misconfigured (missing variables, wrong
// settings). Local builds without MIEL_ENV/Railway stay lenient.
if (isStrict() && process.env.SKIP_ENV_CHECK !== "1") assertEnv();

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy. Next.js needs inline scripts for hydration, so script-src keeps 'unsafe-inline'
 * (a per-request nonce would force every page to render dynamically and lose static caching). Everything else is
 * locked down: no framing, no plugins, forms only to this site, images/connections only from known origins.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.facebook.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://connect.facebook.net",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(process.env.MIEL_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone", // self-contained server for Railway (see scripts/prepare-standalone.mjs)
  outputFileTracingRoot: path.resolve(process.cwd()), // keep .next/standalone/server.js at a predictable path
  // Native modules must stay as real files in node_modules (they are copied into the standalone folder), not bundled.
  serverExternalPackages: ["better-sqlite3", "argon2", "sharp", "archiver", "nodemailer", "@aws-sdk/client-s3"],
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // never ship source maps to browsers
  experimental: { authInterrupts: true }, // enables forbidden() / unauthorized() => real 403 / 401 responses
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
