import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Conservative CSP for an internal CS dashboard. Inline + eval are required
// for Next dev and the Sentry shim; the script-src list otherwise restricts
// origins the app actually loads from. img-src includes data: for the
// inlined SVG icons. connect-src allows HubSpot images / Vercel telemetry.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://browser.sentry-cdn.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://*.hubspot.com https://*.hubspotusercontent-na1.net https://*.hsforms.net",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://api.hubapi.com https://api.anthropic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const wrapped = withBundleAnalyzer(nextConfig);

// Only apply Sentry wrapper when SENTRY_DSN is set — otherwise the wrap is a
// noop overhead. Source-map upload requires SENTRY_AUTH_TOKEN; without it
// errors still capture but stack traces will reference minified code.
const sentryEnabled = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(wrapped, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Tunnel option avoids ad-blockers swallowing Sentry events.
      tunnelRoute: "/api/monitoring",
      disableLogger: true,
    })
  : wrapped;
