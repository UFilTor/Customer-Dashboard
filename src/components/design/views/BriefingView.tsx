"use client";

import { useMemo } from "react";
import type { FlatCompany } from "@/lib/signals";
import { SIGNAL_MAP, SECTION_ORDER, sortBySignal } from "@/lib/signals";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur, fmtHealth } from "@/lib/format-design";
import { Avatar } from "../Avatar";
import { Sparkline } from "../Sparkline";
import { CountUpInt, CountUpEur, Stagger } from "../Motion";
import { synthesizeMonthlyTrend, smoothTrend } from "@/lib/synth-trend";
import { useListKeyboardNav } from "../useListKeyboardNav";
import type { AttentionSignal } from "@/lib/types";

// Plain-English explanation per signal. Used as the tooltip on the
// section header (i) icon and as a fallback for chip tooltips.
const SIGNAL_TOOLTIPS: Record<AttentionSignal, string> = {
  overdue_invoices: "Aggregated across every open-invoice deal on the company. Days overdue is the oldest unpaid invoice we can see; amount is the cumulative outstanding in the deal's local currency with EUR equivalent. Mixed-currency companies show only EUR.",
  open_invoices: "Aggregated across every open-invoice deal on the company. Cumulative outstanding in local currency with EUR equivalent and total invoice count. Mixed-currency companies show only EUR.",
  no_future_events: "Days since the most recent activity (no upcoming bookings).",
  health_score: "Health score before → after the drop. 0–100 scale; lower is worse.",
};

// Format a local-currency amount for display (e.g. "12,500 DKK").
function fmtLocal(amount?: number, currency?: string): string | null {
  if (!amount || !currency) return null;
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

// EUR formatter for the inline "≈ €X" suffix. Tight rendering for chips.
function fmtEurInline(amount?: number): string | null {
  if (!amount) return null;
  if (amount >= 10_000) return `≈ €${Math.round(amount / 1000)}k`;
  return `≈ €${amount.toLocaleString("en-US")}`;
}

interface BriefingViewProps {
  companies: FlatCompany[];
  onSelect: (c: FlatCompany) => void;
  filterLabel?: string | null;
  // When false (typically in person-filter mode), avatars are hidden because
  // the filter pill already conveys ownership.
  showAvatar?: boolean;
}

function buildTrend(c: FlatCompany): number[] {
  return smoothTrend(
    synthesizeMonthlyTrend({
      volume12m: c.volume12m,
      volume6m: c.volume6m,
      volume3m: c.volume3m,
    })
  );
}

export function BriefingView({ companies, onSelect, filterLabel, showAvatar = true }: BriefingViewProps) {
  // Flat list in the same order rows are rendered (sections in SECTION_ORDER,
  // each section sorted by sortBySignal). Drives keyboard nav so arrows + Enter
  // walk the visible queue without a side detail panel.
  const flatList = useMemo<FlatCompany[]>(() => {
    const out: FlatCompany[] = [];
    for (const sig of SECTION_ORDER) {
      out.push(...sortBySignal(sig, companies.filter((c) => c.signal === sig)));
    }
    return out;
  }, [companies]);
  const idxById = useMemo(() => {
    const m = new Map<string, number>();
    flatList.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [flatList]);
  const { focusedIdx, containerRef } = useListKeyboardNav<FlatCompany>(
    flatList,
    (c) => onSelect(c)
  );

  const urgent = companies.filter((c) => SIGNAL_MAP[c.signal].urgent);
  const totalRevenue = companies.reduce((s, c) => s + (c.revenue || 0), 0);
  const overdueAvg = (() => {
    const days = companies.filter((c) => c.daysOverdue != null).map((c) => c.daysOverdue!);
    if (days.length === 0) return 0;
    return Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  })();
  const healthDrops = companies.filter((c) => c.signal === "health_score").length;

  // Greeting + date depend on the user's local clock. SSR renders empty
  // strings; client fills them on first paint. The two text nodes below carry
  // suppressHydrationWarning so React does not flag the intentional swap.
  const isClient = typeof window !== "undefined";
  const greeting = isClient
    ? (() => {
        const h = new Date().getHours();
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      })()
    : "";
  const dateStr = isClient
    ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";

  const overdueInvoices = urgent.filter((c) => c.signal === "overdue_invoices").length;

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
        padding: "32px 28px 60px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* HERO */}
        <div
          style={{
            background: "var(--moss)",
            color: "var(--text-on-moss)",
            borderRadius: 20,
            padding: "36px 40px 32px",
            marginBottom: 28,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            className="drift-slow"
            style={{
              position: "absolute",
              top: -80,
              right: -80,
              width: 260,
              height: 260,
              borderRadius: "50%",
              background: "var(--citrus)",
              opacity: 0.1,
            }}
          />
          <div
            className="drift-slower"
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: "1px solid rgba(241,249,126,0.22)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--citrus)",
                }}
              >
                Daily briefing
              </span>
              <span style={{ height: 1, flex: "0 0 32px", background: "rgba(241,249,126,0.4)" }} />
              <span
                suppressHydrationWarning
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.6)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-editorial)",
                }}
              >
                {dateStr}
              </span>
              {filterLabel && (
                <>
                  <span style={{ height: 1, flex: "0 0 24px", background: "rgba(241,249,126,0.4)" }} />
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      textTransform: "uppercase",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "var(--citrus)",
                      background: "rgba(241,249,126,0.10)",
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {filterLabel}
                  </span>
                </>
              )}
            </div>

            <h1
              suppressHydrationWarning
              style={{
                margin: "0 0 8px",
                fontFamily: "var(--font-editorial)",
                fontWeight: 400,
                fontStyle: "italic",
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                color: "var(--text-on-moss)",
                maxWidth: 700,
              }}
            >
              {greeting}{greeting && "."}
            </h1>

            <h2
              aria-live="polite"
              style={{
                margin: "0 0 20px",
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: 0,
                color: "var(--text-on-moss)",
              }}
            >
              <span className="citrus-wipe" style={{ color: "var(--moss)" }}>
                <CountUpInt value={companies.length} duration={700} /> account{companies.length === 1 ? "" : "s"}
              </span>{" "}
              {urgent.length > 0 ? "need" : "to"}
              <br />
              {urgent.length > 0 ? "you first" : "handle today"}
            </h2>

            <p
              style={{
                margin: "0 0 24px",
                fontSize: 17,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.82)",
                maxWidth: 680,
                letterSpacing: "-0.0125em",
              }}
            >
              {urgent.length > 0 ? (
                <>
                  <strong style={{ color: "var(--citrus)" }}>{urgent.length}</strong> are genuinely time-sensitive
                  {overdueInvoices > 0
                    ? `, including ${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}.`
                    : "."}{" "}
                </>
              ) : (
                <>No overdue invoices or tasks today. </>
              )}
              Health scores dropped on{" "}
              <strong style={{ color: "var(--text-on-moss)" }}>{healthDrops}</strong> account
              {healthDrops === 1 ? "" : "s"} this week.
            </p>

          </div>
        </div>

        {/* STAT BAND */}
        <Stagger
          delay={70}
          initial={120}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}
        >
          <StatTile label="Accounts today" value={<CountUpInt value={companies.length} />} sub={`${urgent.length} urgent`} />
          <StatTile label="Revenue at risk" value={<CountUpEur value={totalRevenue} />} sub="across all signals" />
          <StatTile
            label="Avg days overdue"
            value={
              <>
                <CountUpInt value={overdueAvg} />d
              </>
            }
            sub="invoices + tasks"
          />
          <StatTile
            label="Health drops"
            value={<CountUpInt value={healthDrops} />}
            sub="this week"
            tone={healthDrops > 2 ? "bad" : undefined}
          />
        </Stagger>

        {/* SIGNAL SECTIONS — each grouped by signal and sorted by its own
            urgency (days overdue, health drop, days silent), with revenue as
            the tie-breaker. */}
        {companies.length > 0 && (
          <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {SECTION_ORDER.map((signal) => {
              const items = sortBySignal(signal, companies.filter((c) => c.signal === signal));
              if (items.length === 0) return null;
              return (
                <SignalSection
                  key={signal}
                  signal={signal}
                  companies={items}
                  onSelect={onSelect}
                  showAvatar={showAvatar}
                  focusedIdx={focusedIdx}
                  idxById={idxById}
                />
              );
            })}
          </div>
        )}

        {companies.length === 0 && (
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
            Nothing needs your attention. Enjoy the focus time.
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: "bad";
}) {
  const ink = tone === "bad" ? "var(--rust)" : "var(--moss)";
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 14,
        padding: "18px 18px 16px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--green-100)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 40,
          lineHeight: 1,
          letterSpacing: 0,
          color: ink,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--green-100)", marginTop: 8, letterSpacing: "-0.005em" }}>{sub}</div>
    </div>
  );
}

function SignalSection({
  signal,
  companies,
  onSelect,
  showAvatar,
  focusedIdx,
  idxById,
}: {
  signal: AttentionSignal;
  companies: FlatCompany[];
  onSelect: (c: FlatCompany) => void;
  showAvatar: boolean;
  focusedIdx: number | null;
  idxById: Map<string, number>;
}) {
  const sig = SIGNAL_MAP[signal];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: sig.color }} />
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--green-100)",
          }}
        >
          {sig.label}
        </h3>
        <InfoIcon tooltip={SIGNAL_TOOLTIPS[signal]} />
        <span style={{ fontSize: 12, color: "var(--green-100)", fontVariantNumeric: "tabular-nums" }}>
          {companies.length} account{companies.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        style={{
          background: "var(--light-grey)",
          border: "1px solid var(--beige-gray)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {companies.map((c, i) => {
          const owner = c.ownerId ? OWNER_MAP[c.ownerId] : null;
          // Invoice rows already carry their value in the chip, so the
          // generated-revenue column AND the booking-volume sparkline are
          // hidden for those signals — both convey revenue context that
          // doesn't apply to the invoice numbers shown.
          const isInvoice = c.signal === "overdue_invoices" || c.signal === "open_invoices";
          const trend = isInvoice ? null : buildTrend(c);
          // Build the grid columns dynamically based on what we're rendering.
          const cols = ["1.5fr", "auto"]; // name+detail, chip
          if (!isInvoice) cols.push("auto", "auto"); // revenue, sparkline
          if (showAvatar) cols.push("auto");
          const globalIdx = idxById.get(c.id) ?? -1;
          const isFocused = globalIdx === focusedIdx;
          return (
            <button
              key={`${c.signal}-${c.id}`}
              data-list-idx={globalIdx}
              onClick={() => onSelect(c)}
              className="hrow"
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: cols.join(" "),
                alignItems: "center",
                gap: 16,
                width: "100%",
                padding: "14px 18px",
                borderBottom: i < companies.length - 1 ? "1px solid var(--hairline)" : "none",
                textAlign: "left",
                background: isFocused ? "var(--beige-new)" : "transparent",
                boxShadow: isFocused ? "inset 3px 0 0 var(--moss)" : "none",
                transition: "background 0.15s cubic-bezier(0.8, 0.24, 0.16, 1), box-shadow 0.15s cubic-bezier(0.8, 0.24, 0.16, 1)",
                cursor: "pointer",
                animation: `staggerIn 320ms cubic-bezier(0.22, 1, 0.36, 1) ${80 + Math.min(i, 12) * 24}ms both`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    color: "var(--moss)",
                  }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--green-100)", marginTop: 2 }} className="truncate-line">
                  {c.detail}
                </div>
              </div>
              <SignalValueChip company={c} />
              {!isInvoice && <RevenueChip revenue={c.revenue} />}
              {!isInvoice && trend && <Sparkline data={trend} width={52} height={14} />}
              {showAvatar && <Avatar owner={owner} size={22} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Per-signal chip showing the metric that matters in this section.
// Tooltip on hover explains what the value represents.
function SignalValueChip({ company: c }: { company: FlatCompany }) {
  const baseStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 6,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  if (c.signal === "overdue_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const days = c.daysOverdue != null ? `${c.daysOverdue}d overdue` : null;
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0
      ? `${c.openInvoiceCount} inv`
      : null;
    // Local first, then EUR equivalent — mixed-currency companies skip local.
    const parts = [days, local, local ? eur : eur, inv].filter(Boolean);
    const text = parts.join(" · ") || "n/a";
    return (
      <span
        title={`Oldest unpaid invoice is ${c.daysOverdue ?? 0}d past its due date · ${local ? `outstanding ${local}` : "outstanding"}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv} across the company's deals` : ""}`}
        style={{ ...baseStyle, background: "rgba(184,74,45,0.10)", color: "var(--rust)" }}
      >
        {text}
      </span>
    );
  }
  if (c.signal === "open_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0
      ? `${c.openInvoiceCount} inv`
      : null;
    const parts = [local, local ? eur : eur, inv].filter(Boolean);
    if (parts.length === 0) return <span style={baseStyle} />;
    return (
      <span
        title={`${local ? `Outstanding ${local}` : "Outstanding"}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv} across the company's deals` : ""}`}
        style={{ ...baseStyle, background: "var(--status-warn-bg)", color: "var(--status-warn-fg)" }}
      >
        {parts.join(" · ")}
      </span>
    );
  }
  if (c.signal === "no_future_events") {
    if (c.daysSilent == null) return <span style={baseStyle} />;
    return (
      <span
        title="Days since the most recent activity"
        style={{ ...baseStyle, background: "var(--status-info-bg)", color: "var(--status-info-fg)" }}
      >
        {c.daysSilent}d silent
      </span>
    );
  }
  if (c.signal === "health_score") {
    const prev = fmtHealth(c.previousCategory);
    const cur = fmtHealth(c.healthScore);
    if (prev.num == null || cur.num == null) return <span style={baseStyle} />;
    return (
      <span
        title={`Health score: was ${prev.num} (${prev.label}), now ${cur.num} (${cur.label})`}
        style={{ ...baseStyle, background: "rgba(47,92,62,0.10)", color: "var(--moss)" }}
      >
        {prev.num} → {cur.num}
      </span>
    );
  }
  return <span style={baseStyle} />;
}

// Pill rendering for the per-row generated-revenue figure.
// Tooltip explains the formula so the small number isn't mysterious.
function RevenueChip({ revenue }: { revenue: number | undefined }) {
  return (
    <span
      title="Generated revenue (12-month estimate): booking_volume_12m × booking_fee + contract_MRR × months_as_customer. EUR-converted."
      style={{
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 6,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        background: "rgba(2,44,18,0.08)",
        color: "var(--moss)",
        cursor: "help",
      }}
    >
      {fmtEur(revenue || 0)}
    </span>
  );
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "1px solid var(--beige-gray)",
        color: "var(--green-100)",
        fontSize: 9,
        fontWeight: 700,
        cursor: "help",
        fontFamily: "var(--font-display)",
      }}
    >
      i
    </span>
  );
}
