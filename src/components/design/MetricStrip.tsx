import { fmtEurFull, fmtHealth } from "@/lib/format-design";

interface MetricStripProps {
  company: Record<string, string>;
  deal: Record<string, string> | null;
}

interface TileProps {
  label: string;
  value: React.ReactNode;
  tone?: "good" | "warn" | "bad" | "highlight";
}

function Tile({ label, value, tone }: TileProps) {
  let bg = "var(--light-grey)", ink = "var(--moss)", labelColor = "var(--green-100)", border = "var(--beige-gray)";
  if (tone === "bad") { bg = "rgba(147,63,41,0.06)"; ink = "var(--rust)"; labelColor = "rgba(147,63,41,0.75)"; border = "rgba(147,63,41,0.18)"; }
  if (tone === "good") { bg = "rgba(5,100,60,0.05)"; ink = "#065F46"; labelColor = "rgba(5,100,60,0.7)"; border = "rgba(5,100,60,0.18)"; }
  if (tone === "warn") { bg = "rgba(184,118,31,0.07)"; ink = "#92400E"; labelColor = "rgba(184,118,31,0.8)"; border = "rgba(184,118,31,0.22)"; }
  if (tone === "highlight") { bg = "var(--moss)"; ink = "var(--citrus)"; labelColor = "rgba(241,249,126,0.7)"; border = "var(--moss)"; }

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 14px 13px" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1,
          color: ink,
          letterSpacing: 0,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function payStatusLabel(company: Record<string, string>, deal: Record<string, string> | null): { label: string; tone?: "good" | "warn" | "bad" } {
  if (company.understory_pay_unwilling === "true") return { label: "Unwilling", tone: "bad" };
  if (company.understory_pay_ineligible === "true") return { label: "Ineligible", tone: "warn" };
  if (company.understory_pay_live === "true") return { label: "Live", tone: "good" };
  if (company.understory_pay_verification_status) return { label: "Verification" };
  if (company.understory_has_started_understory_pay_onboarding === "true") return { label: "Onboarding" };
  const dealStatus = deal?.understory_pay_status__customer;
  if (dealStatus) return { label: dealStatus };
  return { label: "Not started" };
}

function invoiceLabel(deal: Record<string, string> | null): { label: string; tone?: "good" | "warn" | "bad" } {
  if (!deal) return { label: "Up to date", tone: "good" };
  const open = parseInt(deal.number_of_open_invoices || "0") || 0;
  if (open <= 0) return { label: "Up to date", tone: "good" };
  const due = deal.invoice_due_date;
  if (due && due < new Date().toISOString().split("T")[0]) {
    const days = Math.floor((Date.now() - new Date(due).getTime()) / 86400000);
    return { label: `${days}d overdue`, tone: "bad" };
  }
  return { label: `${open} open`, tone: "warn" };
}

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

function generatedRevenueEur(company: Record<string, string>, deal: Record<string, string> | null): number {
  const volume = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const fee = parseFloat(deal?.booking_fee || deal?.confirmed_booking_fee || "0") || 0;
  const mrr = parseFloat(deal?.confirmed__contract_mrr || "0") || 0;
  const currency = (deal?.deal_currency_code || "EUR").toUpperCase();
  const rate = TO_EUR[currency] ?? 1;
  const created = company.createdate ? new Date(company.createdate).getTime() : 0;
  const months = created > 0
    ? Math.min(12, Math.floor((Date.now() - created) / (30.44 * 24 * 60 * 60 * 1000)))
    : 12;
  return Math.round(volume * fee + mrr * months * rate);
}

export function MetricStrip({ company, deal }: MetricStripProps) {
  const volume12m = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const revenue = generatedRevenueEur(company, deal);
  const pay = payStatusLabel(company, deal);
  const invoice = invoiceLabel(deal);
  const health = fmtHealth(company.health_score);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 }}>
      <Tile label="Booking volume 12M" value={fmtEurFull(volume12m)} />
      <Tile label="Revenue 12M" value={fmtEurFull(revenue)} tone="highlight" />
      <Tile label="Understory Pay" value={pay.label} tone={pay.tone} />
      <Tile label="Invoice" value={invoice.label} tone={invoice.tone} />
      <Tile
        label="Health score"
        value={`${health.label}${health.num != null ? ` (${health.num})` : ""}`}
        tone={health.tone === "muted" ? undefined : health.tone}
      />
    </div>
  );
}
