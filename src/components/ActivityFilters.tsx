"use client";

import { useState } from "react";

const TYPES = ["call", "meeting", "note", "email"] as const;
const TYPE_LABELS: Record<string, string> = {
  call: "Calls",
  meeting: "Meetings",
  note: "Notes",
  email: "Emails",
};
const DATE_PRESETS = [7, 30, 60, 90, 180, 365] as const;

interface Props {
  onFilterChange: (filters: { types: string[] | null; daysBack: number }) => void;
}

export default function useActivityFilters({ onFilterChange }: Props) {
  const [activeTypes, setActiveTypes] = useState<string[] | null>(null); // null = all
  const [daysBack, setDaysBack] = useState(365);

  function handleTypeClick(type: string) {
    let next: string[] | null;
    if (activeTypes === null) {
      // "All" was active, switch to just this type
      next = [type];
    } else if (activeTypes.includes(type)) {
      // Toggle off
      const filtered = activeTypes.filter((t) => t !== type);
      next = filtered.length === 0 ? null : filtered;
    } else {
      // Toggle on
      const added = [...activeTypes, type];
      next = added.length === TYPES.length ? null : added;
    }
    setActiveTypes(next);
    onFilterChange({ types: next, daysBack });
  }

  function handleAllClick() {
    setActiveTypes(null);
    onFilterChange({ types: null, daysBack });
  }

  function handleDaysClick(days: number) {
    setDaysBack(days);
    onFilterChange({ types: activeTypes, daysBack: days });
  }

  const pillBase = "px-3 py-1 rounded-2xl text-xs font-medium cursor-pointer transition-colors";
  const pillActive = `${pillBase} bg-[var(--moss)] text-white border border-[var(--moss)]`;
  const pillInactive = `${pillBase} border border-[#E5E5E0] text-[#999] hover:border-[#CCC]`;

  return {
    typePills: (
      <div className="flex gap-1.5 flex-wrap">
        <button
          className={activeTypes === null ? pillActive : pillInactive}
          onClick={handleAllClick}
        >
          All
        </button>
        {TYPES.map((type) => (
          <button
            key={type}
            className={
              activeTypes?.includes(type) ? pillActive : pillInactive
            }
            onClick={() => handleTypeClick(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    ),
    datePills: (
      <div className="flex gap-1.5">
        {DATE_PRESETS.map((days) => (
          <button
            key={days}
            className={daysBack === days ? pillActive : pillInactive}
            onClick={() => handleDaysClick(days)}
          >
            {days}d
          </button>
        ))}
      </div>
    ),
  };
}
