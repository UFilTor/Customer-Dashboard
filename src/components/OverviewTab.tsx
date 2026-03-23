import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { RecapCard } from "./RecapCard";
import { OwnerMap, StageMap, Recap } from "@/lib/types";

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
    return raw;
  }

  return (
    <div>
      <RecapCard recap={recap} companyId={companyId} />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Company Info</h3>
          <div className="space-y-2">
            {dashboardConfig.tabs.overview.companyInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-sm">
                <span className="text-[var(--green-100)]">{field.label}</span>
                <FieldRenderer
                  value={resolveValue(field.property, company, field.format)}
                  format={field.format}
                  currencyCode={field.format === "currency" ? currencyCode : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Lifecycle Deal</h3>
          {deal ? (
            <div className="space-y-2">
              {dashboardConfig.tabs.overview.dealInfo.map((field) => (
                <div key={field.property} className="flex justify-between text-sm">
                  <span className="text-[var(--green-100)]">{field.label}</span>
                  <FieldRenderer
                    value={resolveValue(field.property, deal, field.format)}
                    format={field.format}
                    currencyCode={field.format === "currency" ? currencyCode : undefined}
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
