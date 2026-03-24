"use client";

import type { AttentionCompany } from "@/lib/types";
import { formatGroupDuration } from "@/lib/timeline";

const OWNER_NAMES: Record<string, string> = {
  "962517007": "Anders Hansen",
  "559364799": "Cecilia Lexe",
  "1939229547": "Filip Torstensson",
  "44912650": "Marc Moller Nielsen",
};

interface Props {
  company: AttentionCompany;
}

export default function CompanyTooltip({ company }: Props) {
  const duration = formatGroupDuration(company.enteredGroupAt);
  const ownerName = company.ownerId ? (OWNER_NAMES[company.ownerId] || company.ownerId) : undefined;

  const fields = [
    { label: "Revenue", value: company.mrr && company.mrr !== "-" ? company.mrr : undefined },
    { label: "Owner", value: ownerName },
    { label: "Detail", value: company.detail || undefined },
    { label: "In group", value: duration || undefined },
    company.daysOverdue !== undefined ? { label: "Overdue", value: `${company.daysOverdue} days` } : null,
    company.daysSilent !== undefined ? { label: "Silent", value: `${company.daysSilent} days` } : null,
    company.previousCategory ? { label: "Was", value: company.previousCategory } : null,
  ].filter((f): f is { label: string; value: string } => f !== null && f.value !== undefined);

  return (
    <div className="absolute left-0 top-full mt-1 bg-white border border-[#EDEDEA] rounded-lg shadow-lg p-3 z-50 w-64 animate-fadeIn">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="text-[10px] text-[#999] uppercase tracking-wide">{f.label}</span>
            <div className="text-xs font-medium text-[var(--moss)]">{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
