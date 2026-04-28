// Lightweight perf instrumentation. Wrap async work in `withTiming` to capture
// a labeled span; collect spans into a Spans object and emit them as a
// Server-Timing response header (rendered natively by Chrome DevTools) and as
// a single console line per request for terminal visibility during dev.

export type Span = { label: string; ms: number };
export type Spans = Span[];

export function createSpans(): Spans {
  return [];
}

export async function withTiming<T>(
  spans: Spans,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    spans.push({ label, ms: performance.now() - t0 });
  }
}

export function timingSync<T>(spans: Spans, label: string, fn: () => T): T {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    spans.push({ label, ms: performance.now() - t0 });
  }
}

// Server-Timing format: `name;dur=<ms>, name2;dur=<ms>`
// Labels can only contain token chars; we replace anything else with `_`.
export function serverTimingHeader(spans: Spans): string {
  return spans
    .map((s) => `${s.label.replace(/[^A-Za-z0-9._-]/g, "_")};dur=${s.ms.toFixed(1)}`)
    .join(", ");
}

export function logSpans(route: string, spans: Spans): void {
  const total = spans.reduce((sum, s) => sum + s.ms, 0);
  const parts = spans
    .map((s) => `${s.label}=${s.ms.toFixed(0)}ms`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.log(`[perf] ${route} total=${total.toFixed(0)}ms ${parts}`);
}
