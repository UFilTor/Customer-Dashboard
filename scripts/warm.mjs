// Local cache warmer. Production has a Vercel cron hitting /api/cron/warm
// every 14 min; localhost has nothing, so every dev restart (or 15-min TTL
// expiry) means cold 5s+ builds. Run this once after `npm run dev` (or any
// time things feel cold): `npm run warm`.
//
// Hits the same targets as the cron, minus the CRON_SECRET gate (we call the
// public routes directly). Sequential-ish batches so we don't hammer HubSpot.

const BASE = process.env.WARM_BASE_URL || "http://localhost:3000";

// Keep in sync with OWNERS in src/lib/owners.ts (plain script, no TS imports).
const OWNERS = [
  { id: "34100335", name: "Alessandro", region: "IT" },
  { id: "962517007", name: "Anders", region: "DK" },
  { id: "559364799", name: "Cecilia", region: "SE" },
  { id: "1939229547", name: "Filip", region: "SE" },
  { id: "44912650", name: "Marc", region: "DK" },
  { id: "34100332", name: "Nicoletta", region: "IT" },
  { id: "90324081", name: "Vlad", region: "IT" },
];

const regionIds = (region) =>
  OWNERS.filter((o) => o.region === region)
    .map((o) => o.id)
    .sort()
    .join(",");

const mainTargets = [
  "/api/attention",
  "/api/pay-migration",
  "/api/meeting-prep",
  "/api/portfolio",
];
const scopeTargets = ["DK", "SE", "IT"].flatMap((r) => [
  `/api/meeting-prep?ownerIds=${regionIds(r)}`,
  `/api/portfolio?ownerIds=${regionIds(r)}`,
]);
const personTargets = OWNERS.flatMap((o) => [
  `/api/meeting-prep?ownerIds=${o.id}`,
  `/api/portfolio?ownerIds=${o.id}`,
]);

async function hit(path) {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`);
    // Drain the body so the server finishes the response.
    await res.arrayBuffer();
    console.log(`  ${res.ok ? "ok " : `${res.status}`} ${((Date.now() - t) / 1000).toFixed(1)}s  ${path}`);
  } catch (err) {
    console.log(`  ERR ${path} — ${err.message} (is the dev server running on ${BASE}?)`);
  }
}

// Limited concurrency: a full build fans out into many HubSpot calls, and
// >4-5 concurrent builds trips HubSpot's burst rate limit (renders as 500s).
async function runPool(paths, limit = 3) {
  const queue = [...paths];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (queue.length > 0) {
        const path = queue.shift();
        if (path) await hit(path);
      }
    })
  );
}

const t0 = Date.now();
console.log(`Warming ${BASE} ...`);
console.log("Main routes:");
await runPool(mainTargets);
// Portfolio builds are the heaviest; keep scope batches at 2 concurrent to
// stay under HubSpot's burst limit.
console.log("Region scopes:");
await runPool(scopeTargets, 2);
console.log("Person scopes:");
await runPool(personTargets, 2);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
