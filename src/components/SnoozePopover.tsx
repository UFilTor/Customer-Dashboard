// src/components/SnoozePopover.tsx
"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  isOpen: boolean;
  onSnooze: (until: string) => void;
  onClose: () => void;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default function SnoozePopover({ isOpen, onSnooze, onClose }: Props) {
  const [customDate, setCustomDate] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const presets = [
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52 z-50 animate-fadeIn"
    >
      <div className="text-xs font-semibold text-[var(--moss)] mb-2">
        Snooze this company
      </div>
      <div className="flex flex-col gap-0.5">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => onSnooze(addDays(p.days))}
            className="text-left px-2.5 py-1.5 rounded-md text-sm text-gray-600 hover:bg-[var(--light-grey)] transition-all duration-200"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="border-t border-gray-100 my-2" />
      <div className="flex items-center gap-2 px-2.5">
        <span className="text-sm text-gray-600">Until:</span>
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          onBlur={() => {
            if (customDate) {
              onSnooze(new Date(customDate + "T23:59:59").toISOString());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customDate) {
              onSnooze(new Date(customDate + "T23:59:59").toISOString());
            }
          }}
          min={new Date().toISOString().split("T")[0]}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 flex-1"
        />
      </div>
    </div>
  );
}
