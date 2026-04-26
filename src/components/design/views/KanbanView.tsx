"use client";

import { useMemo } from "react";
import type { FlatCompany } from "@/lib/signals";
import { SIGNALS } from "@/lib/signals";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur } from "@/lib/format-design";
import { urgencyScore } from "@/lib/urgency";
import { Avatar } from "../Avatar";
import { Sparkline } from "../Sparkline";
import { synthesizeMonthlyTrend, smoothTrend } from "@/lib/synth-trend";

interface KanbanViewProps {
  companies: FlatCompany[];
  onSelect: (c: FlatCompany) => void;
}

export function KanbanView({ companies, onSelect }: KanbanViewProps) {
  const groups = useMemo(() => {
    const buckets = new Map<string, FlatCompany[]>();
    for (const c of companies) {
      const arr = buckets.get(c.signal) || [];
      arr.push(c);
      buckets.set(c.signal, arr);
    }
    return SIGNALS.map((meta) => ({ meta, items: buckets.get(meta.key) || [] })).filter(
      (g) => g.items.length > 0
    );
  }, [companies]);

  return (
    <div
      style={{
        padding: "32px 28px 60px",
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--green-100)",
              marginBottom: 6,
            }}
          >
            By signal
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 0,
              color: "var(--moss)",
              lineHeight: 0.95,
            }}
          >
            Grouped by what
            <br />
            needs handling
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              color: "var(--green-100)",
              letterSpacing: "-0.0125em",
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            {companies.length} accounts across {groups.length} signal{groups.length === 1 ? "" : "s"}. Urgency flows top
            to bottom within each column.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            // Equal-width columns that always fit the centered wrapper.
            // minmax(0, 1fr) prevents any column from growing wider than its share.
            gridTemplateColumns: `repeat(${Math.max(groups.length, 1)}, minmax(0, 1fr))`,
            gap: 16,
            alignItems: "flex-start",
          }}
        >
        {groups.map((g) => {
          const sorted = [...g.items].sort((a, b) => urgencyScore(b) - urgencyScore(a));
          const totalRev = sorted.reduce((s, c) => s + (c.revenue || 0), 0);
          return (
            <div
              key={g.meta.key}
              style={{
                background: "var(--light-grey)",
                border: "1px solid var(--beige-gray)",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--hairline)", position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 16,
                    right: 16,
                    height: 3,
                    background: g.meta.color,
                    borderRadius: "0 0 2px 2px",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      textTransform: "uppercase",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      color: "var(--moss)",
                    }}
                  >
                    {g.meta.label}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: g.meta.urgent ? "var(--rust)" : "var(--moss)",
                      color: g.meta.urgent ? "#fff" : "var(--citrus)",
                      fontWeight: 700,
                    }}
                  >
                    {sorted.length}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--green-100)",
                  }}
                >
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--moss)" }}>
                    {fmtEur(totalRev)}
                  </span>
                  <span>at risk</span>
                </div>
              </div>
              <div style={{ padding: 10, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                {sorted.map((c) => (
                  <KanbanCard key={`${c.signal}-${c.id}`} c={c} onClick={() => onSelect(c)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

        {groups.length === 0 && (
          <div
            style={{
              background: "var(--light-grey)",
              border: "1px dashed var(--beige-gray)",
              borderRadius: 16,
              padding: 60,
              textAlign: "center",
              color: "var(--green-100)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
              fontSize: 16,
            }}
          >
            Nothing matches the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ c, onClick }: { c: FlatCompany; onClick: () => void }) {
  const owner = c.ownerId ? OWNER_MAP[c.ownerId] : null;
  const trend = smoothTrend(
    synthesizeMonthlyTrend({ volume12m: c.volume12m, volume6m: c.volume6m, volume3m: c.volume3m })
  );
  return (
    <button
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid var(--hairline)",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.8, 0.24, 0.16, 1)",
        textAlign: "left",
        width: "100%",
        display: "block",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--beige-gray)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--hairline)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span
          className="truncate-line"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em", color: "var(--moss)" }}
        >
          {c.name}
        </span>
        <Avatar owner={owner} size={20} />
      </div>
      <div className="truncate-line" style={{ fontSize: 12, color: "var(--green-100)", marginBottom: 10, lineHeight: 1.4 }}>
        {c.detail}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--moss)", fontVariantNumeric: "tabular-nums" }}>
            {fmtEur(c.revenue || 0)}
          </span>
          {c.daysOverdue != null && c.signal === "overdue_invoices" && (
            <span
              style={{
                fontSize: 10.5,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(147,63,41,0.10)",
                color: "var(--rust)",
                fontWeight: 600,
              }}
            >
              {c.daysOverdue}d
            </span>
          )}
        </div>
        <Sparkline data={trend} width={56} height={14} />
      </div>
    </button>
  );
}
