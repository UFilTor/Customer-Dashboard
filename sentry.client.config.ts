import * as Sentry from "@sentry/nextjs";

// Browser-side error capture. Only initializes when SENTRY_DSN is set;
// otherwise this is a no-op so dev / preview deploys without Sentry
// configured don't try to ship telemetry.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Sample 10% of perf transactions in prod (Speed Insights covers most of
    // this already) and 100% of errors. Tune via Sentry dashboard later.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Capture 0% of replays in dev, 10% on prod errors. Replay is the most
    // bandwidth-heavy feature; keep it conservative until we have a need.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // Don't spam Sentry with retune dev-overlay noise (when an old
    // NEXT_PUBLIC_RETUNE flag accidentally leaks into prod).
    ignoreErrors: [
      /retune/i,
      /WebSocket connection/i,
      /retune\.manifest\.json/i,
    ],
  });
}
