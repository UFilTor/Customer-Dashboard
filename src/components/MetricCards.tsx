import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
}

export function MetricCards({ company, deal }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;
        const formatted = formatValue(value, card.format);
        const isInvoice = card.format === "invoiceStatus";

        let colorClass = "text-[#022C12]";
        if (isInvoice) {
          colorClass =
            formatted === "Overdue"
              ? "text-red-600"
              : formatted === "Open"
              ? "text-orange-500"
              : "text-green-600";
        }

        return (
          <div key={card.property} className="bg-[#f0fdf4] rounded-2xl p-4">
            <div className="text-[#6b7280] text-xs uppercase tracking-wide mb-1">
              {card.label}
            </div>
            <div className={`text-xl font-bold ${colorClass}`}>{formatted}</div>
          </div>
        );
      })}
    </div>
  );
}
