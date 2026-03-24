import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { RecapCard } from "./RecapCard";
import { OwnerMap, StageMap, Recap } from "@/lib/types";

function formatRelativeDate(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return date.toISOString().split("T")[0];
}

function renderPayStatus(company: Record<string, string>, deal: Record<string, string> | null) {
  if (company.understory_pay_unwilling === "true") {
    return (
      <span className="text-xs font-medium text-[var(--rust)]">
        Unwilling{company.understory_pay_unwilling_reason ? ` - ${company.understory_pay_unwilling_reason}` : ""}
      </span>
    );
  }
  if (company.understory_pay_ineligible === "true") {
    return (
      <span className="text-xs font-medium text-orange-600">
        Ineligible{company.understory_pay_ineligible_reason ? ` - ${company.understory_pay_ineligible_reason}` : ""}
      </span>
    );
  }

  const stages = [
    { label: "Not Started", active: false },
    { label: "Onboarding", active: company.understory_has_started_understory_pay_onboarding === "true" },
    { label: "Verification", active: !!company.understory_pay_verification_status },
    { label: "Live", active: company.understory_pay_live === "true" },
  ];
  let currentStageIndex = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].active) { currentStageIndex = i; break; }
  }

  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${i <= currentStageIndex ? "bg-[var(--moss)]" : "bg-[#EDEDEA]"}`} />
          <span className={`text-[10px] ${i <= currentStageIndex ? "text-[var(--moss)] font-medium" : "text-[var(--green-100)]"}`}>
            {stage.label}
          </span>
          {i < stages.length - 1 && <div className={`w-3 h-px ${i < currentStageIndex ? "bg-[var(--moss)]" : "bg-[#EDEDEA]"}`} />}
        </div>
      ))}
    </div>
  );
}

const HEALTH_COMPONENTS = [
  { key: "understory_health_score_actual_acv", label: "Volume" },
  { key: "understory_health_score_customer_storefront_visits", label: "Storefront" },
  { key: "understory_health_score_customer_widget_visits", label: "Widget" },
  { key: "understory_health_score_features_enabled", label: "Features" },
  { key: "understory_health_score_login_last_month", label: "Logins" },
  { key: "understory_health_score_transactions_diff", label: "Transactions" },
  { key: "understory_health_score_upcoming_events", label: "Events" },
];

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
    if (format === "currency" && source === deal && currencyCode !== "EUR") {
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        const rate = TO_EUR[currencyCode.toUpperCase()] ?? 1;
        return String(Math.round(num * rate));
      }
    }
    return raw;
  }

  // Volume trend growth calc
  const m3 = parseFloat(company.understory_booking_volume_3m || "0");
  const m6 = parseFloat(company.understory_booking_volume_6m || "0");
  const previous3m = m6 > 0 && m3 > 0 ? m6 - m3 : 0;
  const growthPct = previous3m > 0 ? Math.round(((m3 - previous3m) / previous3m) * 100) : null;

  return (
    <div>
      <RecapCard recap={recap} companyId={companyId} />

      {/* Combined insights row: Health + Engagement + Pay + Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">

        {/* Health Score Breakdown - compact */}
        {company.health_score && (
          <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3">
            <div className="text-[10px] text-[var(--green-100)] uppercase tracking-wide mb-2">Health Breakdown</div>
            <div className="grid grid-cols-4 gap-2">
              {HEALTH_COMPONENTS.map(({ key, label }) => {
                const pct = Math.round(parseFloat(company[key] || "0") * 100);
                const color = pct >= 70 ? "#065F46" : pct >= 40 ? "#92400E" : "#991B1B";
                const barColor = pct >= 70 ? "#6EE7B7" : pct >= 40 ? "#FCD34D" : "#FCA5A5";
                return (
                  <div key={key} className="text-center">
                    <div className="text-[9px] text-[var(--green-100)] truncate">{label}</div>
                    <div className="text-xs font-bold" style={{ color }}>{pct}%</div>
                    <div className="w-full h-1 rounded-full mt-0.5" style={{ backgroundColor: "#EDEDEA" }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Booking Volume Trend - compact */}
        {company.understory_booking_volume_12m && (
          <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-[var(--green-100)] uppercase tracking-wide">Volume Trend</span>
              {growthPct !== null && (
                <span className={`text-[10px] font-medium ${growthPct > 0 ? "text-[#065F46]" : "text-[var(--rust)]"}`}>
                  {growthPct > 0 ? "↑" : "↓"} {Math.abs(growthPct)}% vs prev 3mo
                </span>
              )}
            </div>
            <div className="flex gap-3">
              {[
                { key: "understory_booking_volume_1m", label: "1M" },
                { key: "understory_booking_volume_3m", label: "3M" },
                { key: "understory_booking_volume_6m", label: "6M" },
                { key: "understory_booking_volume_12m", label: "12M" },
              ].map(({ key, label }) => {
                const val = parseFloat(company[key] || "0");
                return (
                  <div key={key} className="text-center flex-1">
                    <div className="text-[9px] text-[var(--green-100)]">{label}</div>
                    <div className="text-xs font-bold text-[var(--moss)]">
                      {val > 0 ? `€${Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}` : "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Platform Engagement + Pay Status - single compact row */}
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3 mb-3">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          {[
            { key: "understory_backoffice_latest_visit", label: "Backoffice" },
            { key: "understory_storefront_latest_visit", label: "Storefront" },
            { key: "understory_widget_latest_visit", label: "Widget" },
          ].map(({ key, label }) => {
            const value = company[key];
            const date = value ? new Date(value) : null;
            const isOld = date ? (Date.now() - date.getTime()) > 30 * 86400000 : true;
            const formatted = date && !isNaN(date.getTime()) ? formatRelativeDate(date) : "No data";
            return (
              <div key={key}>
                <span className="text-[9px] text-[var(--green-100)] uppercase tracking-wide">{label}: </span>
                <span className={`text-xs font-medium ${isOld ? "text-[var(--rust)]" : "text-[var(--moss)]"}`}>{formatted}</span>
              </div>
            );
          })}
          <div className="border-l border-[#EDEDEA] pl-4">
            <span className="text-[9px] text-[var(--green-100)] uppercase tracking-wide">Pay: </span>
            {renderPayStatus(company, deal)}
          </div>
        </div>
      </div>

      {/* Company Info + Deal Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3">
          <h3 className="font-semibold text-[var(--moss)] text-sm mb-2">Company Info</h3>
          <div className="space-y-0">
            {dashboardConfig.tabs.overview.companyInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-xs py-1.5 border-b border-[#F0EEE8] last:border-b-0">
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

        <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-[var(--moss)] text-sm">Lifecycle Deal</h3>
            {deal?.hs_object_id && (
              <a
                href={`https://app.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID}/deal/${deal.hs_object_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--moss)] underline hover:text-[var(--green-100)]"
              >
                Open in HubSpot
              </a>
            )}
          </div>
          {deal ? (
            <div className="space-y-0">
              {dashboardConfig.tabs.overview.dealInfo.map((field) => (
                <div key={field.property} className="flex justify-between text-xs py-1.5 border-b border-[#F0EEE8] last:border-b-0">
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
            <p className="text-[var(--green-100)] text-xs">No lifecycle deal found</p>
          )}
        </div>
      </div>
    </div>
  );
}
