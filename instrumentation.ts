// Next.js instrumentation hook. Boots Sentry's Node / edge configs based on
// the runtime, so server-side errors get captured. The actual init is in
// sentry.{server,edge}.config.ts and is gated on SENTRY_DSN being set.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
