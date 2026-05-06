"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

// Brand-styled date picker. Replaces <input type="date"> wherever we want the
// calendar UI itself (not just the field) to read in Inter + moss/beige rather
// than the platform's native popup. Selected day fills with --moss; today is
// outlined; weekends muted; weeks start Monday to match Filip's Nordic norm.

interface Props {
  value?: string; // yyyy-mm-dd or empty
  onChange: (value: string | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s: string | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const inputStyle: CSSProperties = {
  width: 130,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid var(--hairline-strong)",
  background: "var(--card-bg)",
  color: "var(--moss)",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--font-inter, Inter, system-ui)",
  cursor: "pointer",
  textAlign: "left",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

export function DatePopover({ value, onChange, ariaLabel, placeholder = "yyyy-mm-dd" }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const selected = parseYmd(value);
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());

  useEffect(() => {
    if (!open) return;
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      setPopPos({ top: r.bottom + 6, left: r.left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Snap the calendar cursor to the selected date when the popover opens.
  // Using the prevX-during-render pattern instead of setState-in-effect so
  // the strict eslint rule stops barking. Convergent: only fires on the
  // open transition or when `value` changes while open.
  const openSig = `${open ? 1 : 0}|${value ?? ""}`;
  const [prevOpenSig, setPrevOpenSig] = useState(openSig);
  if (prevOpenSig !== openSig) {
    setPrevOpenSig(openSig);
    if (open && selected) setCursor(selected);
  }

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  // Monday-first: getDay returns 0=Sun..6=Sat. Convert to 0=Mon..6=Sun.
  const startDow = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();

  const prevMonthLast = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();

  // Build a 6-week grid (42 cells) so the popover height is stable across months.
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < startDow; i++) {
    const day = prevMonthLast - startDow + 1 + i;
    cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth() - 1, day), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), inMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }

  const todayStr = ymd(new Date());

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  function pickDate(d: Date) {
    onChange(ymd(d));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        style={inputStyle}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {value || <span style={{ color: "var(--green-100)" }}>{placeholder}</span>}
        </span>
        <CalendarGlyph />
      </button>
      {open && popPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          // The popup is portaled to document.body, so any ancestor's
          // outside-close listener (e.g. RefinePill's useOutsideClose,
          // which fires on pointerdown) would treat clicks here as
          // "outside" and unmount the popover before the day button's
          // onClick fires. Halt pointerdown + mousedown bubbling so the
          // click can complete.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popPos.top,
            left: popPos.left,
            zIndex: 60,
            background: "var(--card-bg, #FFF)",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 8px 28px rgba(2,44,18,0.14)",
            minWidth: 244,
            fontFamily: "var(--font-inter, Inter, system-ui)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              style={navBtnStyle}
            >
              ‹
            </button>
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--moss)",
                letterSpacing: "-0.005em",
              }}
            >
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              style={navBtnStyle}
            >
              ›
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              marginBottom: 4,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--green-100)",
            }}
          >
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} style={{ textAlign: "center", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map(({ date, inMonth }, i) => {
              const dStr = ymd(date);
              const isSelected = value === dStr;
              const isToday = dStr === todayStr;
              const dow = (date.getDay() + 6) % 7; // Mon=0..Sun=6
              const isWeekend = dow >= 5;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDate(date)}
                  style={{
                    aspectRatio: "1 / 1",
                    border: isToday && !isSelected ? "1px solid var(--moss)" : "1px solid transparent",
                    borderRadius: 8,
                    background: isSelected ? "var(--moss)" : "transparent",
                    color: isSelected
                      ? "var(--text-on-moss, #FFF)"
                      : !inMonth
                      ? "color-mix(in oklch, var(--green-100) 65%, transparent)"
                      : isWeekend
                      ? "var(--green-100)"
                      : "var(--moss)",
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 500,
                    fontVariantNumeric: "tabular-nums",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "var(--beige)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid var(--hairline)",
              marginTop: 10,
              paddingTop: 8,
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              style={linkBtnStyle}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => pickDate(new Date())}
              style={linkBtnStyle}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const navBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid var(--hairline)",
  background: "var(--card-bg, transparent)",
  color: "var(--moss)",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const linkBtnStyle: CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--moss)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: "2px 4px",
};

function CalendarGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6h12" />
      <path d="M5.5 2v2M10.5 2v2" strokeLinecap="round" />
    </svg>
  );
}
