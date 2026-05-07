// HubSpot deal-level invoice fields (post-2026-05 rename). The old
// `unpaid_invoice` boolean was retired and replaced by per-invoice rollup
// fields. The "any unpaid invoice?" boolean is now derived from the count
// (see `hasUnpaidInvoice`).
//
// Always include this list when fetching deal props if the consumer
// renders or signals on invoice state — keeps every flow in lockstep.
export const UNPAID_INVOICE_DEAL_PROPS = [
  "understory_earliest_unpaid_invoice_created_date",
  "understory_earliest_unpaid_invoice_due_date",
  "understory_number_of_unpaid_invoices",
  "understory_unpaid_amount_local_currency",
  "payment_method",
  "deal_currency_code",
  "currency",
] as const;

export function unpaidInvoiceCount(p: Record<string, string | undefined>): number {
  const raw = parseInt(p.understory_number_of_unpaid_invoices || "0", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function hasUnpaidInvoice(p: Record<string, string | undefined>): boolean {
  return unpaidInvoiceCount(p) > 0;
}

export function unpaidAmountLocal(p: Record<string, string | undefined>): number {
  const raw = parseFloat(p.understory_unpaid_amount_local_currency || "0");
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function dealCurrency(p: Record<string, string | undefined>): string {
  return (p.deal_currency_code || p.currency || "EUR").toUpperCase();
}
