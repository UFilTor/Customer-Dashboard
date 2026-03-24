import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";
import { getHealthLabel } from "@/lib/health-score";

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

function computeRevenueLastYear(company: Record<string, string>, deal: Record<string, string> | null): string {
  // Volume is already in EUR, MRR is in deal currency
  const volume = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const fee = parseFloat(deal?.booking_fee || deal?.confirmed_booking_fee || "0") || 0;
  const mrr = parseFloat(deal?.confirmed__contract_mrr || "0") || 0;
  const currency = (deal?.deal_currency_code || "EUR").toUpperCase();
  const mrrRate = TO_EUR[currency] ?? 1;

  // Months as customer (max 12)
  const createDate = company.createdate ? new Date(company.createdate).getTime() : 0;
  const monthsAsCustomer = createDate > 0
    ? Math.min(12, Math.floor((Date.now() - createDate) / (30.44 * 24 * 60 * 60 * 1000)))
    : 12;

  const bookingFeeRevenue = volume * fee; // Already EUR
  const mrrRevenue = mrr * monthsAsCustomer * mrrRate; // Convert to EUR
  const total = Math.round(bookingFeeRevenue + mrrRevenue);
  if (total === 0) return "-";
  return `\u20ac${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  previousCategory?: string;
}

export function MetricCards({ company, deal, previousCategory }: Props) {
  const currencyCode = deal?.deal_currency_code || "EUR";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;

        let formatted: string;
        if (card.format === "revenue12m") {
          formatted = computeRevenueLastYear(company, deal);
        } else if (card.format === "currency") {
          const rawNum = parseFloat(value || "0") || 0;
          if (rawNum === 0) {
            formatted = "-";
          } else if (card.source === "company") {
            // Company fields (booking volume, etc.) are already in EUR
            const eur = Math.round(rawNum);
            formatted = `\u20ac${eur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
          } else {
            // Deal fields need currency conversion
            const currency = currencyCode.toUpperCase();
            const rate = TO_EUR[currency] ?? 1;
            if (currency === "EUR") {
              formatted = formatValue(value, card.format, currencyCode);
            } else {
              const eur = Math.round(rawNum * rate);
              formatted = `\u20ac${eur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
            }
          }
        } else if (card.format === "text" && card.property === "health_score") {
          if (value === null || value === undefined || value === "") {
            formatted = "-";
          } else {
            const label = getHealthLabel(value);
            formatted = `${label} (${Math.round(parseFloat(value))})`;
          }
        } else {
          formatted = formatValue(value, card.format, undefined);
        }

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
            // "Up to date" or any non-overdue state: green
            bgClass = "bg-[#D1FAE5]";
            textClass = "text-[#065F46]";
            labelClass = "text-[#065F46]/70";
          }
        }

        return (
          <div key={card.property} className={`${bgClass} rounded-[var(--border-radius)] p-3 text-center`}>
            <div className={`${labelClass} text-xs uppercase tracking-wide mb-1`}>
              {card.label}
            </div>
            <div className={`text-lg font-bold ${textClass}`}>{formatted}</div>
            {card.property === "health_score" && previousCategory && value && (
              <div className="mt-1 text-xs text-[var(--green-100)]">
                {parseFloat(value) > parseFloat(previousCategory) ? "↑" : "↓"} was {getHealthLabel(previousCategory)} ({Math.round(parseFloat(previousCategory))})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
