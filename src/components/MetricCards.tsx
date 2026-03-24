import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
}

export function MetricCards({ company, deal }: Props) {
  const count = dashboardConfig.metricCards.length;
  const currencyCode = deal?.deal_currency_code || "EUR";

  return (
    <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;
        const formatted = formatValue(value, card.format, card.format === "currency" ? currencyCode : undefined);
        const isInvoice = card.format === "invoiceStatus";

        let bgClass = "bg-[#F9F9F7]";
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
          <div key={card.property} className={`${bgClass} rounded-[var(--border-radius)] p-4`}>
            <div className={`${labelClass} text-xs uppercase tracking-wide mb-1`}>
              {card.label}
            </div>
            <div className={`text-xl font-bold ${textClass}`}>{formatted}</div>
          </div>
        );
      })}
    </div>
  );
}
