"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState } from "react";
import { type PortfolioShownStatuses } from "@/lib/portfolio-views";
import { Caret, eyebrowStyle, pillTriggerStyle, useOutsideClose } from "./chrome";

export function StatusFilterPill({
  shownStatuses,
  toggleStatus,
  snoozedCount,
}: {
  shownStatuses: PortfolioShownStatuses;
  toggleStatus: (s: keyof PortfolioShownStatuses) => void;
  snoozedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClose(wrapRef, open, () => setOpen(false));

  // ⇧T mirrors ⇧F (Signals) and ⇧S (Sort). Bails on meta/ctrl so we don't
  // collide with browser shortcuts; altKey is allowed for Nordic layouts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inInput) return;
      if (e.metaKey || e.ctrlKey) return;
      if (!e.shiftKey) return;
      if (e.key === "T" || e.key === "t") {
        setOpen((v) => !v);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mirror open-state to page-client so list-nav yields while open.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-portfolio-popup-state", { detail: open })
    );
  }, [open]);

  const activeCount =
    (shownStatuses.paused ? 1 : 0) +
    (shownStatuses.product_hold ? 1 : 0) +
    (shownStatuses.hibernation ? 1 : 0) +
    (shownStatuses.snoozed ? 1 : 0);
  const label = activeCount === 0 ? "Active only" : `+${activeCount} included`;

  const items: Array<{ key: keyof PortfolioShownStatuses; label: string }> = [
    { key: "paused", label: "Paused" },
    { key: "product_hold", label: "Product hold" },
    { key: "hibernation", label: "Hibernation" },
    { key: "snoozed", label: snoozedCount > 0 ? `Snoozed (${snoozedCount})` : "Snoozed" },
  ];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={pillTriggerStyle(activeCount > 0)}
      >
        <span style={eyebrowStyle}>Status</span>
        <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{label}</span>
        <span className="kbd">⇧T</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="pf-pop" style={{ left: 0, width: 240 }}>
          <div
            style={{
              padding: "10px 14px 8px 20px",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <div style={eyebrowStyle}>Include status</div>
          </div>
          <div style={{ padding: 6 }}>
            {items.map((item) => {
              const isOn = shownStatuses[item.key];
              return (
                <button
                  key={item.key}
                  onClick={() => toggleStatus(item.key)}
                  className={`pf-pop-row${isOn ? " selected" : ""}`}
                >
                  <span className={`pf-checkbox${isOn ? " on" : ""}`}>
                    {isOn && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M3 6.5L5 8.5L9 4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Views pill (saved filter combos) ----------
