#!/usr/bin/env node
// Cold/warm fetch microbench. Hits each instrumented API route twice — once
// with ?refresh=true (cold cache, real HubSpot work), once warm — and prints
// the Server-Timing breakdown.
//
// Usage:
//   npm run dev            # in another terminal
//   npm run perf

const BASE = process.env.PERF_BASE || "http://localhost:3000";
const ROUTES = [
  "/api/attention",
  "/api/onboarding",
  "/api/pay-migration",
];

function parseServerTiming(header) {
  if (!header) return [];
  return header.split(",").map((part) => {
    const [name, ...attrs] = part.trim().split(";").map((s) => s.trim());
    const dur = attrs
      .map((a) => a.match(/^dur=([\d.]+)$/))
      .find(Boolean);
    return { name, ms: dur ? parseFloat(dur[1]) : null };
  });
}

async function hit(route, { cold }) {
  const url = `${BASE}${route}${cold ? (route.includes("?") ? "&" : "?") + "refresh=true" : ""}`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Cookie: process.env.PERF_COOKIE || "" } });
  const wallMs = performance.now() - t0;
  const spans = parseServerTiming(res.headers.get("server-timing"));
  const status = res.status;
  // Drain body so the request actually completes
  await res.arrayBuffer();
  return { wallMs, status, spans };
}

function fmt(n) {
  return n == null ? "?" : `${n.toFixed(0).padStart(5)}ms`;
}

(async () => {
  console.log(`Hitting ${BASE}\n`);
  for (const route of ROUTES) {
    const cold = await hit(route, { cold: true });
    const warm = await hit(route, { cold: false });
    console.log(`${route}`);
    console.log(`  cold  wall=${fmt(cold.wallMs)}  status=${cold.status}`);
    if (cold.spans.length > 0) {
      const top = [...cold.spans].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 6);
      for (const s of top) console.log(`        ${s.name.padEnd(28)} ${fmt(s.ms)}`);
    }
    console.log(`  warm  wall=${fmt(warm.wallMs)}  status=${warm.status}`);
    console.log("");
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
