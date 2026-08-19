"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type PortfolioRefineState, type PortfolioRow, type PortfolioSignalKey } from "@/lib/types";
import { DatePopover } from "../../DatePopover";
import { Caret, eyebrowStyle, pillTriggerStyle, refineInputStyle, useOutsideClose } from "./chrome";

function refineActiveCount(r: PortfolioRefineState): number {
  let n = 0;
  if (r.acvMin != null) n++;
  if (r.acvMax != null) n++;
  if (r.daysInStageMin != null) n++;
  if (r.daysInStageMax != null) n++;
  if (r.stages && r.stages.length > 0) n++;
  if (r.adoptionAfter) n++;
  if (r.adoptionBefore) n++;
  if (r.goneQuietMinDays != null) n++;
  if (r.healthMaxScore != null) n++;
  if (r.stuckMinDaysPast != null) n++;
  if (r.overdueMinDays != null) n++;
  if (r.volumeMinDropPct != null) n++;
  return n;
}

const STAGE_OPTIONS: PortfolioRow["stage"][] = [
  "Onboarding",
  "Adopted",
  "Started",
  "Ramp Up",
  "Established",
];

function StageMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: PortfolioRow["stage"][];
  onToggle: (stage: PortfolioRow["stage"]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Portal-aware outside-close: useOutsideClose only checks the trigger
  // wrapper, but our popover lives in document.body via createPortal, so we
  // need a manual listener that allows clicks inside either node.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      setPopPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const label =
    selected.length === 0
      ? "All stages"
      : selected.length === 1
      ? selected[0]
      : selected.length === STAGE_OPTIONS.length
      ? "All stages"
      : `${selected.length} selected`;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "6px 12px",
          borderRadius: 8,
          border: `1px solid ${selected.length > 0 ? "var(--moss)" : "var(--hairline-strong)"}`,
          background: "var(--card-bg)",
          color: "var(--moss)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <Caret open={open} />
      </button>
      {open && popPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popPos.top,
            left: popPos.left,
            width: popPos.width,
            zIndex: 60,
            background: "var(--card-bg)",
            border: "1px solid var(--hairline)",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(2,44,18,0.14)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 6 }}>
            {STAGE_OPTIONS.map((stage) => {
              const on = selected.includes(stage);
              return (
                <button
                  key={stage}
                  onClick={() => onToggle(stage)}
                  className={`pf-pop-row${on ? " selected" : ""}`}
                  style={{ width: "100%" }}
                >
                  <span className={`pf-checkbox${on ? " on" : ""}`}>
                    {on && (
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
                  <span style={{ flex: 1 }}>{stage}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--hairline)",
                padding: "6px 12px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--moss)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function RefineRangeRow({
  label,
  minValue,
  maxValue,
  onMin,
  onMax,
}: {
  label: string;
  minValue: number | undefined;
  maxValue: number | undefined;
  onMin: (v: number | undefined) => void;
  onMax: (v: number | undefined) => void;
}) {
  return (
    <div>
      <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Min"
          value={minValue ?? ""}
          onChange={(e) => onMin(e.target.value === "" ? undefined : Number(e.target.value))}
          style={refineInputStyle}
        />
        <span style={{ color: "var(--green-100)", fontSize: 12 }}>to</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Max"
          value={maxValue ?? ""}
          onChange={(e) => onMax(e.target.value === "" ? undefined : Number(e.target.value))}
          style={refineInputStyle}
        />
      </div>
    </div>
  );
}

function RefineSingleRow({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, fontSize: 12, color: "var(--moss)", fontWeight: 600 }}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        placeholder="—"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        style={refineInputStyle}
      />
      {suffix && <span style={{ fontSize: 11, color: "var(--green-100)" }}>{suffix}</span>}
    </div>
  );
}

// ---------- Signal pill ----------

export function RefinePill({
  refine,
  setRefine,
  selectedSignals,
  stackedSignals,
  toggleStackedSignals,
}: {
  refine: PortfolioRefineState;
  setRefine: (next: PortfolioRefineState | ((prev: PortfolioRefineState) => PortfolioRefineState)) => void;
  selectedSignals: PortfolioSignalKey[];
  stackedSignals: boolean;
  toggleStackedSignals: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClose(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "Escape" && open) {
        setOpen(false);
        e.preventDefault();
        return;
      }
      if (inInput) return;
      if (e.metaKey || e.ctrlKey) return;
      if (!e.shiftKey) return;
      if (e.key === "R" || e.key === "r") {
        setOpen((v) => !v);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ud-portfolio-popup-state", { detail: open }));
  }, [open]);

  const active = refineActiveCount(refine);
  const label = active === 0 ? "None" : `${active} active`;

  function update<K extends keyof PortfolioRefineState>(key: K, value: PortfolioRefineState[K]) {
    setRefine((prev) => {
      const next = { ...prev };
      if (value === undefined || (typeof value === "number" && Number.isNaN(value))) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }
  function clearAll() {
    setRefine({});
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={pillTriggerStyle(active > 0)}>
        <span style={eyebrowStyle}>Refine</span>
        <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{label}</span>
        <span className="kbd">⇧R</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="pf-pop" style={{ left: 0, width: 320, maxWidth: "calc(100vw - 80px)" }}>
          <div
            style={{
              padding: "10px 14px 8px 20px",
              borderBottom: "1px solid var(--hairline)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={eyebrowStyle}>Refine results</div>
            <span style={{ flex: 1 }} />
            <button
              onClick={clearAll}
              style={{
                background: "transparent",
                color: "var(--moss)",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 6px",
                borderRadius: 6,
                cursor: "pointer",
                border: 0,
              }}
            >
              Clear all
            </button>
          </div>

          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Match mode — only relevant when 2+ signals are selected */}
            <div style={{ opacity: selectedSignals.length < 2 ? 0.5 : 1 }}>
              <div style={{ ...eyebrowStyle, marginBottom: 6 }}>Match signals</div>
              <div
                role="group"
                style={{
                  display: "inline-flex",
                  border: "1px solid var(--hairline-strong)",
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "var(--card-bg)",
                }}
              >
                {[
                  { id: "any", label: "Any", on: !stackedSignals },
                  { id: "all", label: "All", on: stackedSignals },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (selectedSignals.length < 2) return;
                      if (opt.on) return;
                      toggleStackedSignals();
                    }}
                    disabled={selectedSignals.length < 2}
                    style={{
                      padding: "5px 12px",
                      background: opt.on ? "var(--moss)" : "transparent",
                      color: opt.on ? "var(--text-on-moss)" : "var(--moss)",
                      border: 0,
                      cursor: selectedSignals.length < 2 ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--green-100)", marginTop: 4 }}>
                {selectedSignals.length < 2
                  ? "Select 2+ signals to combine them"
                  : stackedSignals
                  ? "Rows must match every selected signal"
                  : "Rows match any selected signal"}
              </div>
            </div>

            <RefineRangeRow
              label="ACV (EUR)"
              minValue={refine.acvMin}
              maxValue={refine.acvMax}
              onMin={(v) => update("acvMin", v)}
              onMax={(v) => update("acvMax", v)}
            />

            <RefineRangeRow
              label="Days in stage"
              minValue={refine.daysInStageMin}
              maxValue={refine.daysInStageMax}
              onMin={(v) => update("daysInStageMin", v)}
              onMax={(v) => update("daysInStageMax", v)}
            />

            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 6 }}>Stage</div>
              <StageMultiSelect
                selected={refine.stages ?? []}
                onToggle={(stage) => {
                  const current = refine.stages ?? [];
                  const on = current.includes(stage);
                  const next = on
                    ? current.filter((s) => s !== stage)
                    : [...current, stage];
                  update("stages", next.length > 0 ? next : undefined);
                }}
                onClear={() => update("stages", undefined)}
              />
            </div>

            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 6 }}>Estimated adoption date</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DatePopover
                  value={refine.adoptionBefore}
                  onChange={(v) => update("adoptionBefore", v)}
                  ariaLabel="On or before"
                  placeholder="Before"
                />
                <span style={{ color: "var(--green-100)", fontSize: 12 }}>to</span>
                <DatePopover
                  value={refine.adoptionAfter}
                  onChange={(v) => update("adoptionAfter", v)}
                  ariaLabel="On or after"
                  placeholder="After"
                />
              </div>
            </div>

            {selectedSignals.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid var(--hairline)",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={eyebrowStyle}>Tighten signals</div>

                {selectedSignals.includes("gone_quiet") && (
                  <RefineSingleRow
                    label="Quiet ≥"
                    suffix="days"
                    value={refine.goneQuietMinDays}
                    onChange={(v) => update("goneQuietMinDays", v)}
                  />
                )}
                {selectedSignals.includes("health_dropped") && (
                  <RefineSingleRow
                    label="Health ≤"
                    suffix=""
                    value={refine.healthMaxScore}
                    onChange={(v) => update("healthMaxScore", v)}
                  />
                )}
                {selectedSignals.includes("stuck_in_step") && (
                  <RefineSingleRow
                    label="Days past expected ≥"
                    suffix="days"
                    value={refine.stuckMinDaysPast}
                    onChange={(v) => update("stuckMinDaysPast", v)}
                  />
                )}
                {selectedSignals.includes("overdue_invoices") && (
                  <RefineSingleRow
                    label="Overdue ≥"
                    suffix="days"
                    value={refine.overdueMinDays}
                    onChange={(v) => update("overdueMinDays", v)}
                  />
                )}
                {selectedSignals.includes("volume_declining") && (
                  <RefineSingleRow
                    label="Drop ≥"
                    suffix="%"
                    value={refine.volumeMinDropPct != null ? Math.round(refine.volumeMinDropPct * 100) : undefined}
                    onChange={(v) => update("volumeMinDropPct", v == null ? undefined : v / 100)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
