import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";

const CATEGORY_ORDER = ["Healthy", "Monitor", "At Risk", "Critical Churn Risk"];

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  previousCategory?: string;
}

export function MetricCards({ company, deal, previousCategory }: Props) {
  const count = dashboardConfig.metricCards.length;
  const currencyCode = deal?.deal_currency_code || "EUR";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;
        const formatted = formatValue(value, card.format, card.format === "currency" ? currencyCode : undefined);
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

        const isHealthScore = card.property === "Health Score Category";

        return (
          <div key={card.property} className={`${bgClass} rounded-[var(--border-radius)] p-3`}>
            <div className={`${labelClass} text-xs uppercase tracking-wide mb-1`}>
              {card.label}
            </div>
            <div className={`text-lg font-bold ${textClass}`}>{formatted}</div>
            {isHealthScore && formatted && formatted !== "-" && previousCategory && previousCategory !== formatted && (
              <div className="mt-1.5 text-xs text-[var(--green-100)]">
                {previousCategory && (
                  <span>
                    {CATEGORY_ORDER.indexOf(formatted) < CATEGORY_ORDER.indexOf(previousCategory) ? "↑" : "↓"}{" "}
                    was {previousCategory}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
