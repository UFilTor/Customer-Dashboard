// Single source of truth for currency-to-EUR conversion. Approximate spot
// rates covering only the currencies the CS team actually transacts in.
// Previously five hardcoded copies of this table lived in attention.ts,
// meeting-prep.ts, onboarding.ts, hubspot.ts and recent-companies.ts and
// had drifted apart (NOK 0.085 vs 0.086, GBP 1.16 vs 1.18). The values
// below are the canonical set (formerly attention.ts).
export const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

// Convert an amount to EUR. Unknown or missing currency codes fall back to
// a rate of 1 (treated as already-EUR), matching the historic behavior of
// every call site.
export function toEur(amount: number, currencyCode: string | undefined): number {
  const rate = TO_EUR[(currencyCode || "EUR").toUpperCase()] ?? 1;
  return amount * rate;
}
