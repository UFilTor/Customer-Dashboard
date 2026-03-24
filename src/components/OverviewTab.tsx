import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { RecapCard } from "./RecapCard";
import { OwnerMap, StageMap, Recap } from "@/lib/types";

function formatRelativeDate(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return date.toISOString().split("T")[0];
}

function renderPayStatus(company: Record<string, string>, deal: Record<string, string> | null) {
  const stages = [
    { label: "Not Started", active: false },
    { label: "Onboarding", active: company.understory_has_started_understory_pay_onboarding === "true" },
    { label: "Verification", active: !!company.understory_pay_verification_status },
    { label: "Live", active: company.understory_pay_live === "true" },
  ];

  if (company.understory_pay_unwilling === "true") {
    return (
      <div>
        <div className="text-sm font-medium text-[var(--rust)]">Unwilling</div>
        {company.understory_pay_unwilling_reason && (
          <div className="text-xs text-[var(--green-100)] mt-1">Reason: {company.understory_pay_unwilling_reason}</div>
        )}
      </div>
    );
  }

  if (company.understory_pay_ineligible === "true") {
    return (
      <div>
        <div className="text-sm font-medium text-orange-600">Ineligible</div>
        {company.understory_pay_ineligible_reason && (
          <div className="text-xs text-[var(--green-100)] mt-1">Reason: {company.understory_pay_ineligible_reason}</div>
        )}
      </div>
    );
  }

  let currentStageIndex = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].active) { currentStageIndex = i; break; }
  }

  const shareOfTx = deal?.share_of_transactions_via_understory_pay;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${i <= currentStageIndex ? "bg-[var(--moss)]" : "bg-[#EDEDEA]"}`} />
            <span className={`text-xs ${i <= currentStageIndex ? "text-[var(--moss)] font-medium" : "text-[var(--green-100)]"}`}>
              {stage.label}
            </span>
            {i < stages.length - 1 && <div className={`w-4 h-px ${i < currentStageIndex ? "bg-[var(--moss)]" : "bg-[#EDEDEA]"}`} />}
          </div>
        ))}
      </div>
      {company.understory_pay_live === "true" && company.understory_pay_live_date && (
        <div className="text-xs text-[var(--green-100)]">Live since {new Date(company.understory_pay_live_date).toLocaleDateString("sv-SE")}</div>
      )}
      {shareOfTx && (
        <div className="text-xs text-[var(--green-100)]">Share of transactions via Pay: {Math.round(parseFloat(shareOfTx) * 100)}%</div>
      )}
    </div>
  );
}

const HEALTH_COMPONENTS = [
  { key: "understory_health_score_actual_acv", label: "Business Volume" },
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

      {/* Health Score Breakdown */}
      {company.health_score && (
        <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Health Score Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {HEALTH_COMPONENTS.map(({ key, label }) => {
              const val = parseFloat(company[key] || "0");
              const pct = Math.round(val * 100);
              const color = pct >= 70 ? "#065F46" : pct >= 40 ? "#92400E" : "#991B1B";
              const barColor = pct >= 70 ? "#6EE7B7" : pct >= 40 ? "#FCD34D" : "#FCA5A5";
              return (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-[var(--green-100)] uppercase tracking-wide mb-1">{label}</div>
                  <div className="text-sm font-bold" style={{ color }}>{pct}%</div>
                  <div className="w-full h-1.5 rounded-full mt-1" style={{ backgroundColor: "#EDEDEA" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform Engagement */}
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
        <h3 className="font-semibold text-[var(--moss)] mb-3">Platform Engagement</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: "understory_backoffice_latest_visit", label: "Last Backoffice Login" },
            { key: "understory_storefront_latest_visit", label: "Last Storefront Visit" },
            { key: "understory_widget_latest_visit", label: "Last Widget Visit" },
          ].map(({ key, label }) => {
            const value = company[key];
            const date = value ? new Date(value) : null;
            const isOld = date ? (Date.now() - date.getTime()) > 30 * 86400000 : true;
            const formatted = date && !isNaN(date.getTime()) ? formatRelativeDate(date) : "No data";
            return (
              <div key={key}>
                <div className="text-[10px] text-[var(--green-100)] uppercase tracking-wide mb-1">{label}</div>
                <div className={`text-sm font-medium ${isOld ? "text-[var(--rust)]" : "text-[var(--moss)]"}`}>
                  {formatted}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Understory Pay Status */}
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
        <h3 className="font-semibold text-[var(--moss)] mb-3">Understory Pay</h3>
        {renderPayStatus(company, deal)}
      </div>

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
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[var(--moss)]">Lifecycle Deal</h3>
            {deal?.hs_object_id && (
              <a
                href={`https://app.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID}/deal/${deal.hs_object_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200"
              >
                Open deal in HubSpot
              </a>
            )}
          </div>
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
