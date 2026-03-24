"use client";

import type { AttentionCompany } from "@/lib/types";
import { formatGroupDuration } from "@/lib/timeline";

interface Props {
  company: AttentionCompany;
}

export default function CompanyTooltip({ company }: Props) {
  const duration = formatGroupDuration(company.enteredGroupAt);

  const fields = [
    { label: "Revenue", value: company.mrr || "-" },
    { label: "Health", value: company.detail?.includes("Risk") || company.detail?.includes("Critical") ? company.detail : undefined },
    { label: "In group", value: duration },
  ].filter((f) => f.value);

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
