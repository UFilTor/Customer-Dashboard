import type { RetentionInvoiceState } from "./types";

// Customer Retention pipeline. Same constant lives in onboarding.ts (where it
// is treated as "downstream of onboarding") and attention.ts (where it's the
// scope for churn-risk signals). Keep them in sync.
export const RETENTION_PIPELINE = "1072518362";

// Stages we treat as "live customer in retention scope". Adopted/Started
// overlap with onboarding stage names but are scoped here to the retention
// pipeline — pipeline membership is the discriminator.
export const RETENTION_STAGES = new Set([
  "Adopted",
  "Started",
  "Ramp Up",
  "Established",
]);

// EUR conversion table — kept in sync with src/lib/pay-migration.ts. Only
// covers the currencies the CS team actually transacts in. Add new ones as
// the platform expands.
const TO_EUR: Record<string, number> = {
  EUR: 1,
  SEK: 0.087,
  DKK: 0.134,
  NOK: 0.085,
  GBP: 1.18,
  USD: 0.92,
};

function toEur(amount: number, currency: string | undefined): number {
  const rate = TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  return amount * rate;
}

/** True when a deal record (HubSpot raw properties) is in retention scope. */
export function isRetentionDeal(props: { pipeline?: string; customer_stage?: string }): boolean {
  if (props.pipeline !== RETENTION_PIPELINE) return false;
  return RETENTION_STAGES.has(props.customer_stage || "");
}

/** Extract the deal's invoice state for the brief's Commercial section. */
export function extractInvoiceState(
  props: Record<string, string>,
  nowIso: string
): RetentionInvoiceState {
  const open = parseInt(props.number_of_open_invoices || "0", 10) || 0;
  const unpaid = props.unpaid_invoice === "true";
  const dueIso = props.invoice_due_date || "";
  const outstandingRaw = parseFloat(props.outstanding_amount || "0") || 0;
  const currency = props.deal_currency_code;

  let overdue = 0;
  let overdueDays: number | null = null;
  if (unpaid && dueIso) {
    const due = new Date(dueIso).getTime();
    const now = new Date(nowIso).getTime();
    if (!isNaN(due) && due < now) {
      overdue = 1;
      overdueDays = Math.floor((now - due) / (24 * 60 * 60 * 1000));
    }
  }

  const outstandingEur =
    outstandingRaw > 0 ? Math.round(toEur(outstandingRaw, currency)) : null;

  return { open, overdue, overdueDays, outstandingEur };
}

/** Days between `nowIso` and `iso`, or null when the input is missing/invalid. */
export function daysSinceIso(nowIso: string, iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const now = new Date(nowIso).getTime();
  return Math.floor((now - t) / (24 * 60 * 60 * 1000));
}

// `buildRetentionPayload` and `fetchRetentionHistoryForDeals` are added in
// Task 5. Keeping this file small and tested first.
