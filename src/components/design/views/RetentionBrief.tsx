"use client";

import type {
  RetentionDeal,
  RetentionMeetingEntry,
  WatchOutSignal,
  OnboardingHistoryEntry,
} from "@/lib/types";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { OWNER_MAP } from "@/lib/owners";
import { VolumeChart } from "../VolumeChart";
import { HealthRings } from "../HealthRings";
import { Avatar } from "../Avatar";

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
          padding: "22px 28px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--green-100)",
            }}
          >
            {fmtDateLabel(start)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 4,
              color: "var(--moss)",
            }}
          >
            {fmtTime24(start)}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 10,
              background: "#D6EFD9",
              color: "#1d5021",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "4px 9px",
              borderRadius: 4,
              textTransform: "uppercase",
            }}
          >
            Scheduled
          </div>
        </div>

        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
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
          <div
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 11.5,
              color: "var(--green-100)",
              marginTop: 6,
            }}
          >
            {deal.companyName} & Understory
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                padding: "9px 16px",
                borderRadius: 8,
                textDecoration: "none",
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
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid var(--beige-gray)",
                textDecoration: "none",
              }}
            >
              ↗ Open in HubSpot
            </a>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* LEFT — data */}
        <div
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
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
            padding: 20,
            borderLeft: "1px solid var(--beige-gray)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <PreviousActivity
            history={deal.history}
            historyLoading={historyLoading}
            focusedIdx={historyFocusedIdx}
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
        margin: "0 0 10px",
        paddingBottom: 8,
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
        padding: "4px 0",
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
  return (
    <div>
      <SectionHeader>Commercial</SectionHeader>
      <Row label="Sales owner">{deal.commercial.salesOwner || "—"}</Row>
      <Row label="ACV">{deal.commercial.acv || "—"}</Row>
      <Row label="Booking fee">{deal.commercial.bookingFee || "—"}</Row>
      <Row label="Monthly fee">{deal.commercial.monthlyFee || "—"}</Row>
      <Row label="First billing">{deal.commercial.firstBilling || "—"}</Row>
      <Row label="Open invoices">{inv.open}</Row>
      <Row label="Overdue">
        {inv.overdue > 0 ? (
          <span>
            <b style={{ color: "#7a1d1d" }}>{inv.overdue}</b>
            {inv.overdueDays != null ? ` · ${inv.overdueDays} day${inv.overdueDays === 1 ? "" : "s"}` : ""}
            {inv.outstandingEur != null
              ? ` · ${inv.outstandingEur.toLocaleString("en-US")} EUR`
              : ""}
          </span>
        ) : (
          "0"
        )}
      </Row>
      <Row label="Future events">
        {deal.futureEvents != null ? `${deal.futureEvents} scheduled` : "—"}
      </Row>
    </div>
  );
}

function PreviousActivity({
  history,
  historyLoading,
  focusedIdx,
}: {
  history: OnboardingHistoryEntry[];
  historyLoading: boolean;
  focusedIdx: number | null;
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
      {items.map((h, i) => (
        <ActivityItem key={h.id} entry={h} isFocused={i === focusedIdx} />
      ))}
    </div>
  );
}

function ActivityItem({ entry, isFocused }: { entry: OnboardingHistoryEntry; isFocused: boolean }) {
  const when = new Date(entry.occurredAt);
  const whenLabel = when.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let pillBg = "#d8e1f2";
  let pillFg = "#1d2d6b";
  let pillText = "CALL";
  if (entry.kind === "meeting") {
    pillBg = "#e7d8ed";
    pillFg = "#4a2865";
    pillText = "MEETING";
  } else if (entry.kind === "email") {
    if (entry.direction === "INBOUND") {
      pillBg = "#d4eaf5";
      pillFg = "#103e5a";
      pillText = "EMAIL IN";
    } else {
      pillBg = "#d6efd9";
      pillFg = "#1d5021";
      pillText = "EMAIL OUT";
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 0",
        alignItems: "start",
        outline: isFocused ? "2px solid var(--moss)" : "2px solid transparent",
        outlineOffset: 2,
        borderRadius: 8,
        transition: "outline-color 120ms ease",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--green-muted)",
          marginTop: 8,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              background: pillBg,
              color: pillFg,
            }}
          >
            {pillText}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{whenLabel}</span>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{entry.title}</div>
        {entry.body && (
          <div
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 11.5,
              color: "var(--green-100)",
              marginTop: 4,
              lineHeight: 1.45,
              maxHeight: 48,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {entry.body.slice(0, 280)}
          </div>
        )}
      </div>
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
