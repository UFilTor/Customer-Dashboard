import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import type { SinceLastTouch, SinceLastTouchChange } from "./types";

// "Since last touch" change feed: diff HubSpot property history against the
// timestamp of the last logged touch so the brief can show what moved while
// nobody was looking (health drop, stage change, invoice went unpaid, ...).

export interface PropertyHistoryEntry {
  value: string;
  timestamp: string;
}

// objectId -> property -> history entries (HubSpot returns newest first)
export type HistoryMap = Map<string, Record<string, PropertyHistoryEntry[]>>;

// Properties we diff. Kept deliberately small — every extra property is more
// payload on a batch read and more noise in the brief.
export const SLT_COMPANY_PROPS = ["health_score"];
export const SLT_DEAL_PROPS = [
  "customer_stage",
  "understory_number_of_unpaid_invoices",
  "understory_pay_status__customer",
];

// Ignore changes older than this even when the last touch is ancient —
// a feed of 9-month-old changes helps nobody.
const MAX_LOOKBACK_DAYS = 60;

/**
 * Batch-read property history for a set of objects. Chunks at 50: regular
 * batch reads allow 100 inputs but the `propertiesWithHistory` variant has a
 * stricter limit and 400s otherwise (see pay-migration.ts).
 */
export async function fetchPropertyHistories(
  objectType: "companies" | "deals",
  ids: string[],
  properties: string[]
): Promise<HistoryMap> {
  const map: HistoryMap = new Map();
  if (ids.length === 0 || properties.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/${objectType}/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({
              inputs: chunk.map((id) => ({ id })),
              properties: [],
              propertiesWithHistory: properties,
            }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const result of data.results || []) {
          const perProp: Record<string, PropertyHistoryEntry[]> = {};
          for (const prop of properties) {
            const history = result.propertiesWithHistory?.[prop];
            if (Array.isArray(history) && history.length > 0) {
              perProp[prop] = history.filter(
                (h: PropertyHistoryEntry) => h && h.timestamp
              );
            }
          }
          map.set(String(result.id), perProp);
        }
      } catch {
        // Best-effort — the brief renders without the change feed.
      }
    })
  );
  return map;
}

const FIELD_LABELS: Record<SinceLastTouchChange["field"], string> = {
  health_score: "Health score",
  customer_stage: "Stage",
  unpaid_invoices: "Unpaid invoices",
  pay_status: "Pay status",
};

const PROP_TO_FIELD: Record<string, SinceLastTouchChange["field"]> = {
  health_score: "health_score",
  customer_stage: "customer_stage",
  understory_number_of_unpaid_invoices: "unpaid_invoices",
  understory_pay_status__customer: "pay_status",
};

function formatValue(
  field: SinceLastTouchChange["field"],
  raw: string | null
): string | null {
  if (raw == null || raw === "") return null;
  if (field === "health_score") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? String(Math.round(n)) : null;
  }
  if (field === "unpaid_invoices") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? String(Math.max(0, n)) : null;
  }
  return raw;
}

/**
 * Pure diff: for every tracked property, emit one change when its value moved
 * after the last touch. `from` is the value in effect at touch time (null when
 * HubSpot's retained history doesn't reach back that far). Same-value writes
 * (HubSpot re-saving an identical value) are skipped.
 */
export function computeSinceLastTouch(
  histories: Record<string, PropertyHistoryEntry[]>,
  lastTouchIso: string | null,
  nowIso: string
): SinceLastTouchChange[] {
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(now)) return [];
  const lastTouch = lastTouchIso ? new Date(lastTouchIso).getTime() : NaN;
  if (!Number.isFinite(lastTouch)) return [];
  const cutoff = Math.max(lastTouch, now - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const changes: SinceLastTouchChange[] = [];
  for (const [prop, entries] of Object.entries(histories)) {
    const field = PROP_TO_FIELD[prop];
    if (!field || !entries || entries.length === 0) continue;

    // Entries arrive newest-first. Split at the cutoff.
    let oldestAfterIdx = -1;
    for (let i = 0; i < entries.length; i++) {
      const t = new Date(entries[i].timestamp).getTime();
      if (Number.isFinite(t) && t > cutoff && t <= now) oldestAfterIdx = i;
    }
    if (oldestAfterIdx === -1) continue; // nothing changed since touch

    const newest = entries[0];
    const before = entries[oldestAfterIdx + 1] ?? null;
    const to = formatValue(field, newest.value ?? null);
    const from = before ? formatValue(field, before.value ?? null) : null;
    if (to == null) continue;
    if (from != null && from === to) continue; // identical re-save, not a change

    changes.push({
      field,
      label: FIELD_LABELS[field],
      from,
      to,
      timestamp: newest.timestamp,
    });
  }

  changes.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return changes;
}

/** Assemble the full block for one company/deal pair. */
export function buildSinceLastTouch(
  companyHistories: Record<string, PropertyHistoryEntry[]> | undefined,
  dealHistories: Record<string, PropertyHistoryEntry[]> | undefined,
  lastTouchIso: string | null,
  nowIso: string
): SinceLastTouch | null {
  if (!lastTouchIso) return null;
  const lastTouchMs = new Date(lastTouchIso).getTime();
  if (!Number.isFinite(lastTouchMs)) return null;
  const changes = computeSinceLastTouch(
    { ...(companyHistories || {}), ...(dealHistories || {}) },
    lastTouchIso,
    nowIso
  );
  const days = Math.floor(
    (new Date(nowIso).getTime() - lastTouchMs) / (24 * 60 * 60 * 1000)
  );
  return {
    lastTouch: lastTouchIso,
    daysSinceTouch: Number.isFinite(days) && days >= 0 ? days : null,
    changes,
  };
}
