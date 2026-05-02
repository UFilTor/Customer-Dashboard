"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RetentionDeal,
  RetentionMeetingEntry,
  WatchOutSignal,
  OnboardingHistoryEntry,
} from "@/lib/types";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { fmtFutureEvents } from "@/lib/format-design";
import { OWNER_MAP } from "@/lib/owners";
import { VolumeChart } from "../VolumeChart";
import { HealthRings } from "../HealthRings";
import { Avatar } from "../Avatar";
import { HistoryItem } from "./OnboardingView";

interface Props {
  entry: RetentionMeetingEntry;
  isFocused: boolean;
  historyFocusedIdx: number | null;
  historyLoading: boolean;
}

function fmtTime24(d: Date): string {
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function fmtTenure(daysLive: number | null): string {
  if (daysLive == null) return "Tenure unknown";
  if (daysLive < 60) return `Live ${daysLive} day${daysLive === 1 ? "" : "s"}`;
  if (daysLive < 365) {
    const months = Math.floor(daysLive / 30);
    return `Live ${months} month${months === 1 ? "" : "s"}`;
  }
  const years = (daysLive / 365).toFixed(1).replace(/\.0$/, "");
  return `Live ${years} year${years === "1" ? "" : "s"}`;
}

export function RetentionBrief({ entry, isFocused, historyFocusedIdx, historyLoading }: Props) {
  const { deal, meeting } = entry;
  const start = new Date(meeting.startsAt);
  const ownerLocal = OWNER_MAP[deal.ownerId] || null;
  const companyHref = hubspotCompanyUrl(deal.companyId);
  const dealHref = hubspotDealUrl(deal.dealId);

  // Expand state per history entry (mirrors onboarding's MeetingBriefCard).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Keep the latest focused-history index in a ref so the once-attached
  // ud-retention-history-toggle listener can read it without re-binding.
  const visibleHistory = deal.history.slice(0, 4);
  const focusedHistoryRef = useRef<number | null>(historyFocusedIdx);
  useEffect(() => {
    focusedHistoryRef.current = historyFocusedIdx;
  });
  useEffect(() => {
    if (!isFocused) return;
    function onToggle() {
      const idx = focusedHistoryRef.current;
      if (idx === null || idx === undefined) return;
      const item = visibleHistory[idx];
      if (item) toggleExpanded(item.id);
    }
    window.addEventListener("ud-retention-history-toggle", onToggle);
    return () => window.removeEventListener("ud-retention-history-toggle", onToggle);
  }, [isFocused, visibleHistory]);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: isFocused ? "0 0 0 1px var(--moss) inset" : "none",
      }}
    >
      {/* Header band */}
      <div
        style={{
          background: "var(--beige-new)",
          padding: "14px 22px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--moss)",
            }}
          >
            {fmtTime24(start)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--green-100)",
            }}
          >
            {fmtDateLabel(start)}
          </div>
        </div>

        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.02em",
              margin: 0,
              textTransform: "uppercase",
              color: "var(--moss)",
            }}
          >
            {deal.companyName}
          </h3>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 8,
              fontSize: 12.5,
              color: "var(--moss)",
              opacity: 0.78,
            }}
          >
            <Avatar owner={ownerLocal} size={22} />
            <span>{deal.ownerName || "Unassigned"}</span>
            <Dot />
            <span>{deal.country || "—"}</span>
            <Dot />
            <span style={{ fontWeight: 700 }}>{deal.customerStage}</span>
            <Dot />
            <span>{fmtTenure(deal.daysLive)}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
          {companyHref && (
            <a
              href={companyHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "var(--citrus)",
                color: "var(--moss)",
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 12px",
                borderRadius: 8,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              → View account
            </a>
          )}
          {dealHref && (
            <a
              href={dealHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "var(--light-grey)",
                color: "var(--moss)",
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid var(--beige-gray)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              ↗ HubSpot
            </a>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* LEFT — data */}
        <div
          style={{
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <VolumeChart company={deal.companyProps} />
          <HealthRings company={deal.companyProps} />
          <CustomerSection deal={deal} />
          <CommercialSection deal={deal} />
        </div>

        {/* RIGHT — activity */}
        <div
          style={{
            padding: 14,
            borderLeft: "1px solid var(--beige-gray)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <PreviousActivity
            history={deal.history}
            historyLoading={historyLoading}
            focusedIdx={historyFocusedIdx}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpanded}
          />
          <WatchOutFor signals={deal.watchOuts} />
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span style={{ color: "var(--green-muted)" }}>·</span>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        margin: "0 0 6px",
        paddingBottom: 5,
        borderBottom: "1px solid var(--beige-gray)",
        color: "var(--moss)",
      }}
    >
      {children}
    </h4>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 10,
        padding: "2px 0",
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          opacity: 0.55,
          textTransform: "uppercase",
          paddingTop: 2,
          color: "var(--moss)",
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--moss)" }}>{children}</div>
    </div>
  );
}

function CustomerSection({ deal }: { deal: RetentionDeal }) {
  return (
    <div>
      <SectionHeader>Customer</SectionHeader>
      <Row label="Contact">
        {deal.contactName || deal.contactEmail || deal.contactPhone ? (
          <>
            {deal.contactName && <div>{deal.contactName}</div>}
            {deal.contactEmail && (
              <div>
                <a href={`mailto:${deal.contactEmail}`}>{deal.contactEmail}</a>
              </div>
            )}
            {deal.contactPhone && <div>{deal.contactPhone}</div>}
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
      <Row label="Website">
        {deal.companyDomain ? (
          <a href={toWebUrl(deal.companyDomain)} target="_blank" rel="noopener noreferrer">
            {deal.companyDomain}
          </a>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
      <Row label="Storefront">
        {deal.storefrontLink ? (
          <a href={toWebUrl(deal.storefrontLink)} target="_blank" rel="noopener noreferrer">
            {deal.storefrontLink}
          </a>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
    </div>
  );
}

function toWebUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function CommercialSection({ deal }: { deal: RetentionDeal }) {
  const inv = deal.invoices;
  // Overdue subsumes "open invoice" (an overdue invoice is also open), so we
  // show the more urgent label only. Hide the row entirely when the company
  // has no open or overdue invoices — clean state should not clutter the brief.
  const futureEventsLabel = fmtFutureEvents(deal.futureEvents);
  return (
    <div>
      <SectionHeader>Commercial</SectionHeader>
      <Row label="Sales owner">{deal.commercial.salesOwner || "—"}</Row>
      <Row label="ACV">{deal.commercial.acv || "—"}</Row>
      <Row label="Booking fee">{deal.commercial.bookingFee || "—"}</Row>
      <Row label="Monthly fee">{deal.commercial.monthlyFee || "—"}</Row>
      {inv.overdue > 0 ? (
        <Row label="Overdue">
          <span>
            <b style={{ color: "#7a1d1d" }}>{inv.overdue}</b>
            {inv.overdueDays != null ? ` · ${inv.overdueDays} day${inv.overdueDays === 1 ? "" : "s"}` : ""}
            {inv.outstandingEur != null
              ? ` · ${inv.outstandingEur.toLocaleString("en-US")} EUR`
              : ""}
          </span>
        </Row>
      ) : inv.open > 0 ? (
        <Row label="Open invoices">{inv.open}</Row>
      ) : null}
      {futureEventsLabel && <Row label="Future events">{futureEventsLabel}</Row>}
    </div>
  );
}

function PreviousActivity({
  history,
  historyLoading,
  focusedIdx,
  expandedIds,
  onToggleExpand,
}: {
  history: OnboardingHistoryEntry[];
  historyLoading: boolean;
  focusedIdx: number | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const items = history.slice(0, 4);

  return (
    <div>
      <SectionHeader>Previous activity</SectionHeader>
      {items.length === 0 && historyLoading && (
        <div style={{ opacity: 0.5, fontSize: 12, padding: "8px 0" }}>Loading more activity…</div>
      )}
      {items.length === 0 && !historyLoading && (
        <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>Nothing logged yet.</div>
      )}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((h, i) => (
          <li key={h.id} data-history-idx={i}>
            <HistoryItem
              entry={h}
              expanded={expandedIds.has(h.id)}
              onToggleExpand={() => onToggleExpand(h.id)}
              focused={i === focusedIdx}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function WatchOutFor({ signals }: { signals: WatchOutSignal[] }) {
  return (
    <div>
      <SectionHeader>Watch out for</SectionHeader>
      {signals.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>Nothing flagged.</div>
      ) : (
        signals.map((s, i) => (
          <div
            key={`${s.kind}:${i}`}
            style={{
              background: "#fff",
              border: `1px solid ${s.severity === "bad" ? "#f8d4d4" : "#fce8c2"}`,
              borderLeft: `3px solid ${s.severity === "bad" ? "#c43030" : "#d49500"}`,
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <div
              style={{
                color: s.severity === "bad" ? "#7a1d1d" : "#6b4a05",
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {s.title}
            </div>
            {s.detail}
          </div>
        ))
      )}
    </div>
  );
}
