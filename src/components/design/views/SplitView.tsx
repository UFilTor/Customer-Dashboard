"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FlatCompany, SignalMeta } from "@/lib/signals";
import { SIGNAL_MAP, SECTION_ORDER, sortBySignal } from "@/lib/signals";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur } from "@/lib/format-design";
import type { AttentionSignal, CompanyDetail as CompanyDetailData, OwnerMap, StageMap } from "@/lib/types";
import { fmtHealth } from "@/lib/format-design";

const SIGNAL_TOOLTIPS: Record<AttentionSignal, string> = {
  overdue_invoices: "Days past the invoice due date · outstanding amount in the deal's local currency.",
  open_invoices: "Number of open invoices · outstanding amount in the deal's local currency.",
  no_future_events: "Days since the most recent activity (no upcoming bookings).",
  health_score: "Health score before → after the drop. 0–100 scale; lower is worse.",
};

function fmtLocal(amount?: number, currency?: string): string | null {
  if (!amount || !currency) return null;
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

function fmtEurInline(amount?: number): string | null {
  if (!amount) return null;
  if (amount >= 10_000) return `≈ €${Math.round(amount / 1000)}k`;
  return `≈ €${amount.toLocaleString("en-US")}`;
}
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { CompanyDetail } from "../CompanyDetail";

interface SplitViewProps {
  companies: FlatCompany[];
  selectedId: string | null;
  detailData: (CompanyDetailData & { owners: OwnerMap; stages: StageMap }) | null;
  isLoadingDetail: boolean;
  onSelect: (c: FlatCompany) => void;
  updatedAt: string | null;
  // When false (typically in person-filter mode), the per-row avatar is
  // hidden because the filter pill already conveys ownership.
  showAvatar?: boolean;
}

export function SplitView({
  companies,
  selectedId,
  detailData,
  isLoadingDetail,
  onSelect,
  updatedAt,
  showAvatar = true,
}: SplitViewProps) {
  // Sidebar scroll container — used to scroll the active row into view when
  // arrow-key nav lands on a company that's outside the visible window.
  const listRef = useRef<HTMLDivElement | null>(null);

  // Whenever the selection changes, ensure the active row is visible. Uses
  // block:"nearest" so it only scrolls when needed (no jump if already in view).
  useEffect(() => {
    if (!selectedId) return;
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-row-id="${CSS.escape(selectedId)}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function") {
      (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  // Sidebar buckets follow the canonical SECTION_ORDER and sort each bucket
  // with the same per-signal rules as BriefingView (days overdue / silent /
  // health drop, then revenue tie-break). Companies on signals not in
  // SECTION_ORDER are dropped.
  const grouped = useMemo(() => {
    const buckets = new Map<string, FlatCompany[]>();
    for (const c of companies) {
      const arr = buckets.get(c.signal) || [];
      arr.push(c);
      buckets.set(c.signal, arr);
    }
    return SECTION_ORDER
      .filter((sig) => buckets.has(sig))
      .map((sig) => ({
        meta: SIGNAL_MAP[sig],
        items: sortBySignal(sig, buckets.get(sig) ?? []),
      }));
  }, [companies]);

  // Flat order used by the next/prev pager — mirrors the bucketed order so
  // arrow navigation walks the sidebar from top to bottom.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Auto-select the first sidebar item once on mount — fires when the list
  // arrives, even if it was empty on the very first render. Uses flat[0]
  // (bucketed + sorted) rather than companies[0] (raw parent order) so the
  // detail pane matches the visually-first row in the sidebar. The ref guard
  // ensures we never re-select after the user explicitly cleared the
  // selection (Esc) and never thrash if companies updates more than once.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (selectedId) {
      didAutoSelectRef.current = true;
      return;
    }
    if (flat.length === 0) return;
    didAutoSelectRef.current = true;
    onSelect(flat[0]);
  }, [selectedId, flat, onSelect]);
  const currentIdx = flat.findIndex((c) => c.id === selectedId);
  const next = () => flat[(currentIdx + 1) % flat.length] && onSelect(flat[(currentIdx + 1) % flat.length]);
  const prev = () =>
    flat[(currentIdx - 1 + flat.length) % flat.length] && onSelect(flat[(currentIdx - 1 + flat.length) % flat.length]);

  const updatedLabel = updatedAt ? formatUpdated(updatedAt) : "";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "380px 1fr",
        gap: 0,
        minHeight: "calc(100vh - 120px)",
        background: "var(--beige-new)",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--beige-gray)",
          background: "var(--light-grey)",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 48,
          height: "calc(100vh - 48px)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
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
            The queue
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--moss)",
              lineHeight: 0.95,
            }}
          >
            Needs
            <br />
            attention
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              marginTop: 10,
              fontSize: 12,
              color: "var(--green-100)",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--moss)", fontSize: 13 }}>{companies.length}</span>
            <span>account{companies.length === 1 ? "" : "s"}</span>
            {updatedLabel && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{updatedLabel}</span>
              </>
            )}
          </div>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
          {grouped.map((g) => (
            <SplitGroup
              key={g.meta.key}
              meta={g.meta}
              items={g.items}
              selectedId={selectedId}
              onSelect={onSelect}
              showAvatar={showAvatar}
            />
          ))}
        </div>
      </aside>

      <section style={{ padding: "24px 32px 48px", background: "var(--beige-new)" }}>
        {flat.length === 0 ? (
          <EmptyState />
        ) : !selectedId ? (
          <PickPrompt />
        ) : selectedId && detailData && !isLoadingDetail ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
                fontSize: 12,
                color: "var(--green-100)",
                paddingBottom: 14,
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <button
                onClick={prev}
                style={ghostButton}
                title="Previous"
              >
                <Icon.ArrowLeft />
              </button>
              <button onClick={next} style={ghostButton} title="Next">
                <Icon.ArrowRight />
              </button>
              <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
                {currentIdx >= 0 ? (
                  <>
                    <strong style={{ color: "var(--moss)" }}>{currentIdx + 1}</strong> of {flat.length}
                  </>
                ) : (
                  <span style={{ fontStyle: "italic", fontFamily: "var(--font-editorial)" }}>
                    outside queue · {flat.length} in view
                  </span>
                )}
              </span>
            </div>
            <CompanyDetail companyId={selectedId} data={detailData} embedded />
          </>
        ) : (
          <DetailSkeleton />
        )}
      </section>
    </div>
  );
}

const ghostButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--moss)",
  border: "1px solid var(--hairline)",
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
};

function SplitGroup({
  meta,
  items,
  selectedId,
  onSelect,
  showAvatar,
}: {
  meta: SignalMeta;
  items: FlatCompany[];
  selectedId: string | null;
  onSelect: (c: FlatCompany) => void;
  showAvatar: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px 10px",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          borderTopStyle: "solid",
          borderTopWidth: 1,
          borderTopColor: "var(--hairline)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--moss)",
          }}
        >
          {meta.label}
        </span>
        <span
          title={SIGNAL_TOOLTIPS[meta.key]}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 13,
            height: 13,
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
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: meta.urgent ? "var(--rust)" : "var(--moss)",
            color: meta.urgent ? "var(--text-on-moss)" : "var(--citrus)",
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          {items.length}
        </span>
        <span
          style={{
            marginLeft: "auto",
            color: "var(--green-100)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.3s cubic-bezier(0.8, 0.24, 0.16, 1)",
          }}
        >
          <Icon.Chevron />
        </span>
      </button>
      {open && items.map((c, i) => <SplitRow key={`${c.signal}-${c.id}`} c={c} active={selectedId === c.id} onClick={() => onSelect(c)} showAvatar={showAvatar} index={i} />)}
    </div>
  );
}

function SplitRow({ c, active, onClick, showAvatar, index }: { c: FlatCompany; active: boolean; onClick: () => void; showAvatar: boolean; index: number }) {
  const sig = SIGNAL_MAP[c.signal];
  const owner = c.ownerId ? OWNER_MAP[c.ownerId] : null;
  // Stagger capped at 10 rows so long sections don't drag the last items in
  // half a second after the first.
  const delay = 60 + Math.min(index, 10) * 22;
  return (
    <button
      onClick={onClick}
      data-row-id={c.id}
      className="hrow"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "12px 16px 12px 20px",
        textAlign: "left",
        background: active ? "var(--beige-new)" : "transparent",
        transition: "background 0.2s cubic-bezier(0.8, 0.24, 0.16, 1)",
        borderBottomStyle: "solid",
        borderBottomWidth: 1,
        borderBottomColor: "var(--hairline)",
        cursor: "pointer",
        animation: `staggerIn 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 10,
          bottom: 10,
          width: active ? 3 : 2,
          background: active ? "var(--moss)" : sig.color,
          borderRadius: 2,
          opacity: active ? 1 : 0.7,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          className="truncate-line"
          style={{
            fontSize: 14,
            fontWeight: active ? 600 : 500,
            letterSpacing: "-0.005em",
            color: "var(--moss)",
          }}
        >
          {c.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
            fontSize: 12,
            color: "var(--green-100)",
          }}
        >
          <span className="truncate-line" style={{ maxWidth: 220 }}>
            {c.detail}
          </span>
          <SignalValueInline c={c} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {c.signal !== "overdue_invoices" && c.signal !== "open_invoices" && (
          <span
            title="Generated revenue (12-month estimate): booking_volume_12m × booking_fee + contract_MRR × months_as_customer. EUR-converted."
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 5,
              background: "rgba(2,44,18,0.08)",
              fontWeight: 600,
              color: "var(--moss)",
              fontVariantNumeric: "tabular-nums",
              cursor: "help",
            }}
          >
            {fmtEur(c.revenue || 0)}
          </span>
        )}
        {showAvatar && <Avatar owner={owner} size={20} />}
      </div>
    </button>
  );
}

function EmptyState() {
  return (
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
  );
}

function PickPrompt() {
  return (
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
      Pick an account from the queue.
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div style={{ height: 28, width: "40%", background: "var(--hairline)", borderRadius: 8, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 76, background: "var(--hairline)", borderRadius: 14 }} />
        ))}
      </div>
      <div style={{ height: 120, background: "var(--hairline)", borderRadius: 16, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ height: 220, background: "var(--hairline)", borderRadius: 16 }} />
        <div style={{ height: 220, background: "var(--hairline)", borderRadius: 16 }} />
      </div>
    </div>
  );
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `updated ${hrs}h ago`;
  return `updated ${d.toLocaleDateString()}`;
}

// Compact signal-specific value rendered after the row's detail text.
// Mirrors BriefingView's chip but inline, matching the sidebar density.
function SignalValueInline({ c }: { c: FlatCompany }) {
  if (c.signal === "overdue_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const days = c.daysOverdue != null ? `${c.daysOverdue}d` : null;
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0 ? `${c.openInvoiceCount} inv` : null;
    const parts = [days, local, local ? eur : eur, inv].filter(Boolean);
    if (parts.length === 0) return null;
    return (
      <span
        title={`Oldest unpaid invoice is ${c.daysOverdue ?? 0}d past its due date${local ? ` · outstanding ${local}` : ""}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv} across the company's deals` : ""}`}
        style={{ color: "var(--rust)", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        · {parts.join(" · ")}
      </span>
    );
  }
  if (c.signal === "open_invoices") {
    const local = fmtLocal(c.outstandingLocal, c.outstandingCurrency);
    const eur = fmtEurInline(c.outstandingEur);
    const inv = c.openInvoiceCount && c.openInvoiceCount > 0 ? `${c.openInvoiceCount} inv` : null;
    const parts = [local, local ? eur : eur, inv].filter(Boolean);
    if (parts.length === 0) return null;
    return (
      <span
        title={`${local ? `Outstanding ${local}` : "Outstanding"}${eur ? ` (${eur.replace("≈ ", "")})` : ""}${inv ? ` · ${inv} across the company's deals` : ""}`}
        style={{ color: "var(--status-warn-fg)", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        · {parts.join(" · ")}
      </span>
    );
  }
  if (c.signal === "no_future_events" && c.daysSilent != null) {
    return (
      <span
        title="Days since the most recent activity"
        style={{ color: "var(--status-info-fg)", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        · {c.daysSilent}d silent
      </span>
    );
  }
  if (c.signal === "health_score") {
    const prev = fmtHealth(c.previousCategory);
    const cur = fmtHealth(c.healthScore);
    if (prev.num == null || cur.num == null) return null;
    return (
      <span
        title={`Health score: was ${prev.num} (${prev.label}), now ${cur.num} (${cur.label})`}
        style={{ color: "var(--moss)", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        · {prev.num} → {cur.num}
      </span>
    );
  }
  return null;
}
