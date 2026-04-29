"use client";

import { useMemo, useRef, useState } from "react";
import type { FlatCompany } from "@/lib/signals";
import { SIGNAL_MAP, SECTION_ORDER, sortBySignal } from "@/lib/signals";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur, fmtHealth, relDays } from "@/lib/format-design";
import { Avatar } from "../Avatar";
import { RowContextStrip } from "../RowContextStrip";
import { CountUpInt, CountUpEur, Stagger } from "../Motion";
import { useListKeyboardNav } from "../useListKeyboardNav";
import { prefetchCompany } from "@/lib/prefetch";
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

  // Greeting + date depend on the user's local clock and locale, so the
  // server can't render the right value. We render empty on SSR + first
  // client render, then adjust state during render once we've confirmed
  // we're on the client (the project's `react-hooks/set-state-in-effect`
  // rule blocks the equivalent useEffect — this is the convergent
  // "adjust state during render" pattern instead).
  const [mounted, setMounted] = useState(false);
  const onClient = typeof window !== "undefined";
  if (onClient && !mounted) {
    setMounted(true);
  }
  const greeting = mounted
    ? (() => {
        const h = new Date().getHours();
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      })()
    : "";
  const dateStr = mounted
    ? new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
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
        {/* MORNING BAND — distilled per critique. One editorial line carrying
            date + greeting + counts; no hero theatre, no decorative drift
            circles, no citrus wipe on the count (that moment now lives on the
            Refreshed toast). The first overdue row should land within the
            first viewport on a 900px display. */}
        <div
          suppressHydrationWarning
          style={{
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 10,
            margin: "0 0 18px",
            color: "var(--moss)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--green-100)",
            }}
          >
            Daily briefing
          </span>
          <span aria-hidden="true" style={{ color: "var(--green-100)", opacity: 0.5 }}>·</span>
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 13,
              color: "var(--moss)",
            }}
          >
            {greeting}{greeting && ", "}{dateStr}
          </span>
          {filterLabel && (
            <>
              <span aria-hidden="true" style={{ color: "var(--green-100)", opacity: 0.5 }}>·</span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--moss)",
                  background: "var(--hairline)",
                  padding: "2px 7px",
                  borderRadius: 6,
                }}
              >
                {filterLabel}
              </span>
            </>
          )}
          <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: "var(--green-100)" }}>
            {urgent.length > 0 ? (
              <>
                <strong style={{ color: "var(--moss)" }}>{urgent.length}</strong> urgent
                {overdueInvoices > 0 && (
                  <> · <strong style={{ color: "var(--moss)" }}>{overdueInvoices}</strong> overdue invoice{overdueInvoices === 1 ? "" : "s"}</>
                )}
                {healthDrops > 0 && (
                  <> · <strong style={{ color: "var(--moss)" }}>{healthDrops}</strong> health drop{healthDrops === 1 ? "" : "s"}</>
                )}
              </>
            ) : (
              <>Nothing time-sensitive today.</>
            )}
          </span>
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
  // Moss-on-cream: tiles take the moss banner colour from the other dashboards
  // so the briefing's KPI strip reads as a single anchored band. Label uses
  // citrus (the brand accent does the work the cream label couldn't), big
  // number stays clean white, sub-line drops to a warm white at 70%.
  // The `tone="bad"` variant promotes the value to citrus so a high health-
  // drop count catches the eye without breaking the moss surface.
  const ink = tone === "bad" ? "var(--citrus)" : "var(--text-on-moss)";
  return (
    <div
      style={{
        background: "var(--moss)",
        border: "1px solid var(--moss)",
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
          color: "var(--citrus)",
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
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8, letterSpacing: "-0.005em" }}>{sub}</div>
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
  // Single dwell timer per section — drag-throughs cancel before the prefetch
  // fires, but a real hover (>120ms) kicks off `/api/companies/[id]` so the
  // click that follows resolves from HTTP cache.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const handleHoverEnter = (id: string) => {
    hoverIdRef.current = id;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (hoverIdRef.current) prefetchCompany(hoverIdRef.current);
      hoverTimerRef.current = null;
    }, 120);
  };
  const handleHoverLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };
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
        {/* Grid is name+detail / right-cluster / optional avatar. The
            right-cluster groups revenue + signal pill together so a narrow
            signal ("Weak · 6") doesn't float far away from the revenue
            chip. Cluster sits at the right of the row, hugging its content. */}
        {companies.map((c, i) => {
          const owner = c.ownerId ? OWNER_MAP[c.ownerId] : null;
          const isInvoice = c.signal === "overdue_invoices" || c.signal === "open_invoices";
          const cols = showAvatar ? "1fr auto 28px" : "1fr auto";
          const globalIdx = idxById.get(c.id) ?? -1;
          const isFocused = globalIdx === focusedIdx;
          return (
            <button
              key={`${c.signal}-${c.id}`}
              data-list-idx={globalIdx}
              onClick={() => onSelect(c)}
              onMouseEnter={() => handleHoverEnter(c.id)}
              onMouseLeave={handleHoverLeave}
              className="hrow"
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: cols,
                alignItems: "center",
                gap: 16,
                width: "100%",
                padding: "14px 18px",
                borderBottom: i < companies.length - 1 ? "1px solid var(--hairline)" : "none",
                textAlign: "left",
                background: isFocused ? "var(--beige-new)" : "transparent",
                boxShadow: isFocused ? "inset 3px 0 0 var(--moss)" : "none",
                transition: "background 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out)",
                cursor: "pointer",
                animation: `staggerIn 320ms var(--ease-out) ${80 + Math.min(i, 12) * 24}ms both`,
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
                <RowContextStrip
                  payStatus={c.payStatus}
                  plan={c.plan}
                  lastContactedAt={c.lastContactedAt}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {!isInvoice && <RevenueChip revenue={c.revenue} />}
                <SignalValueChip company={c} />
              </div>
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
// Two-line value chip — top line is a labelled pill (status-tinted), bottom
// line carries the amount/details in a smaller secondary tone. Splits the
// "due-age" badge from the amount so the chip is readable without hover, per
// the impeccable critique on Recognition vs Recall.
function SignalValueChip({ company: c }: { company: FlatCompany }) {
  const pillStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 6,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    whiteSpace: "nowrap",
    display: "inline-block",
  };
  const subStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--green-100)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    marginTop: 2,
    textAlign: "right",
  };
  const wrap: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  };

  if (c.signal === "overdue_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0
      ? `${c.openInvoiceCount} inv`
      : null;
    const sub = [local, local && eur ? eur : eur, inv].filter(Boolean).join(" · ");
    return (
      <span
        style={wrap}
        title={`Oldest unpaid invoice is ${c.daysOverdue ?? 0}d past its due date${local ? ` · outstanding ${local}` : ""}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv}` : ""}`}
      >
        <span style={{ ...pillStyle, background: "rgba(184,74,45,0.10)", color: "var(--rust)" }}>
          {c.daysOverdue != null ? `${c.daysOverdue}d overdue` : "Overdue"}
        </span>
        {sub && <span style={subStyle}>{sub}</span>}
      </span>
    );
  }
  if (c.signal === "open_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0
      ? `${c.openInvoiceCount} inv`
      : null;
    return (
      <span
        style={wrap}
        title={`${local ? `Outstanding ${local}` : "Outstanding"}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv}` : ""}`}
      >
        <span style={{ ...pillStyle, background: "var(--status-warn-bg)", color: "var(--status-warn-fg)" }}>
          Open invoice
        </span>
        {(local || eur || inv) && (
          <span style={subStyle}>
            {[local, local && eur ? eur : eur, inv].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    );
  }
  if (c.signal === "no_future_events") {
    // Pill shows when the customer last *created* an event in their
    // booking system — that's the actual product-usage signal, distinct
    // from the "last contacted" line on the left (which is when CS
    // reached out). Falls back to "No events" if we don't have the date.
    const eventLabel = c.latestEventAt ? relDays(c.latestEventAt) : null;
    const pillText = eventLabel
      ? /^\d{4}-\d{2}-\d{2}$/.test(eventLabel)
        ? `Last event ${eventLabel}`
        : /^\d/.test(eventLabel)
          ? `Last event ${eventLabel}`
          : `Last event ${eventLabel.toLowerCase()}`
      : "No events on record";
    return (
      <span
        style={wrap}
        title={
          c.latestEventAt
            ? `Most recent event added: ${c.latestEventAt.split("T")[0]}`
            : "No event has ever been created on this account"
        }
      >
        <span style={{ ...pillStyle, background: "var(--status-info-bg)", color: "var(--status-info-fg)" }}>
          {pillText}
        </span>
      </span>
    );
  }
  if (c.signal === "health_score") {
    const prev = fmtHealth(c.previousCategory);
    const cur = fmtHealth(c.healthScore);
    const haveBoth = prev.num != null && cur.num != null;
    // Single labelled pill: "Weak · 6" / "At risk · 55" so the user knows
    // what the number is. When a previous score is available, surface the
    // trend on the sub-line: "↓ from 8".
    const pillLabel =
      cur.num != null
        ? `${cur.label} · ${cur.num}`
        : "Health score";
    return (
      <span
        style={wrap}
        title={
          haveBoth
            ? `Health score was ${prev.num} (${prev.label}), now ${cur.num} (${cur.label})`
            : cur.num != null
              ? `Health score: ${cur.num} (${cur.label})`
              : "Health score"
        }
      >
        <span style={{ ...pillStyle, background: "rgba(47,92,62,0.10)", color: "var(--moss)" }}>
          {pillLabel}
        </span>
        {haveBoth && (
          <span style={subStyle}>
            ↓ from {prev.num}
          </span>
        )}
      </span>
    );
  }
  return <span style={wrap} />;
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
