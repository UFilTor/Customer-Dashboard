import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

function computeRevenue12m(company: Record<string, string>, deal: Record<string, string> | null): string {
  const volume = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const fee = parseFloat(deal?.booking_fee || "0") || 0;
  const mrr = parseFloat(deal?.confirmed__contract_mrr || "0") || 0;
  const currency = (deal?.deal_currency_code || "EUR").toUpperCase();
  const revenueLocal = (volume * fee) + (mrr * 12);
  const rate = TO_EUR[currency] ?? 1;
  const revenueEur = Math.round(revenueLocal * rate);
  if (revenueEur === 0) return "-";
  return `\u20ac${revenueEur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  previousCategory?: string;
}

export function MetricCards({ company, deal }: Props) {
  const currencyCode = deal?.deal_currency_code || "EUR";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;
        const formatted = card.format === "revenue12m"
          ? computeRevenue12m(company, deal)
          : formatValue(value, card.format, card.format === "currency" ? currencyCode : undefined);
        const isInvoice = card.format === "invoiceStatus";

        let bgClass = "border border-[#EDEDEA]";
        let textClass = "text-[var(--moss)]";
        let labelClass = "text-[var(--green-100)]";

        if (isInvoice) {
          if (formatted === "Overdue") {
            bgClass = "bg-[var(--rust)]/10";
            textClass = "text-[var(--rust)]";
            labelClass = "text-[var(--rust)]/70";
          } else if (formatted === "Open") {
            bgClass = "bg-orange-100";
            textClass = "text-orange-800";
            labelClass = "text-orange-600";
          } else {
            bgClass = "bg-[var(--lichen)]/40";
            textClass = "text-[var(--moss)]";
            labelClass = "text-[var(--green-100)]";
          }
        }

        return (
          <div key={card.property} className={`${bgClass} rounded-[var(--border-radius)] p-3`}>
            <div className={`${labelClass} text-xs uppercase tracking-wide mb-1`}>
              {card.label}
            </div>
            <div className={`text-lg font-bold ${textClass}`}>{formatted}</div>
          </div>
        );
      })}
    </div>
  );
}
