import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { RecapCard } from "./RecapCard";
import { OwnerMap, StageMap, Recap } from "@/lib/types";

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  stages: StageMap;
  recap: Recap | null;
  companyId: string;
}

export function OverviewTab({ company, deal, owners, stages, recap, companyId }: Props) {
  const currencyCode = deal?.deal_currency_code || "EUR";

  function resolveValue(property: string, source: Record<string, string> | null, format: string): string | null {
    const raw = source?.[property] ?? null;
    if (!raw) return null;
    if (format === "owner") return owners[raw] || raw;
    if (format === "badge" && property === "dealstage") return stages[raw] || raw;
    // Convert deal currency values to EUR (company values are already EUR)
    if (format === "currency" && source === deal && currencyCode !== "EUR") {
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        const rate = TO_EUR[currencyCode.toUpperCase()] ?? 1;
        return String(Math.round(num * rate));
      }
    }
    return raw;
  }

  return (
    <div>
      <RecapCard recap={recap} companyId={companyId} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Company Info</h3>
          <div className="space-y-0">
            {dashboardConfig.tabs.overview.companyInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-sm py-2 border-b border-[#F0EEE8] last:border-b-0">
                <span className="text-[var(--green-100)]">{field.label}</span>
                <FieldRenderer
                  value={resolveValue(field.property, company, field.format)}
                  format={field.format}
                  currencyCode={field.format === "currency" ? "EUR" : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Lifecycle Deal</h3>
          {deal ? (
            <div className="space-y-0">
              {dashboardConfig.tabs.overview.dealInfo.map((field) => (
                <div key={field.property} className="flex justify-between text-sm py-2 border-b border-[#F0EEE8] last:border-b-0">
                  <span className="text-[var(--green-100)]">{field.label}</span>
                  <FieldRenderer
                    value={resolveValue(field.property, deal, field.format)}
                    format={field.format}
                    currencyCode={field.format === "currency" ? "EUR" : undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--green-100)] text-sm">No lifecycle deal found</p>
          )}
        </div>
      </div>
    </div>
  );
}
