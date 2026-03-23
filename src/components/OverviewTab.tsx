import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { OwnerMap, StageMap } from "@/lib/types";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  stages: StageMap;
}

export function OverviewTab({ company, deal, owners, stages }: Props) {
  function resolveValue(property: string, source: Record<string, string> | null, format: string): string | null {
    const raw = source?.[property] ?? null;
    if (!raw) return null;
    if (format === "owner") return owners[raw] || raw;
    if (format === "badge" && property === "dealstage") return stages[raw] || raw;
    return raw;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
        <h3 className="font-semibold text-[#022C12] mb-3">Company Info</h3>
        <div className="space-y-2">
          {dashboardConfig.tabs.overview.companyInfo.map((field) => (
            <div key={field.property} className="flex justify-between text-sm">
              <span className="text-[#9ca3af]">{field.label}</span>
              <FieldRenderer
                value={resolveValue(field.property, company, field.format)}
                format={field.format}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
        <h3 className="font-semibold text-[#022C12] mb-3">Lifecycle Deal</h3>
        {deal ? (
          <div className="space-y-2">
            {dashboardConfig.tabs.overview.dealInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-sm">
                <span className="text-[#9ca3af]">{field.label}</span>
                <FieldRenderer
                  value={resolveValue(field.property, deal, field.format)}
                  format={field.format}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#9ca3af] text-sm">No lifecycle deal found</p>
        )}
      </div>
    </div>
  );
}
