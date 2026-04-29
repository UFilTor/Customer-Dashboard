"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanyDetail as CompanyDetailData, OwnerMap, StageMap, Engagement } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { MetricStrip } from "./MetricStrip";
import { RecapCardBig } from "./RecapCardBig";
import { HealthRings } from "./HealthRings";
import { VolumeChart } from "./VolumeChart";
import { OWNER_MAP } from "@/lib/owners";
import { fmtMrr, fmtHealth, relDays } from "@/lib/format-design";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import { composeEmailUrl, companySummaryLine } from "@/lib/quick-actions";

interface Props {
  companyId: string;
  data: CompanyDetailData & { owners: OwnerMap; stages: StageMap };
  embedded?: boolean;
}

// Shared style for the row of header action buttons (Email / Copy / Open
// in HubSpot). Keeps the cluster visually consistent without lifting the
// styling into globals.css.
const quickActionBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--moss)",
  border: "1px solid var(--hairline)",
  background: "var(--card-bg)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};


export function CompanyDetail({ companyId, data, embedded = false }: Props) {
  const { company, deal, owners, stages, engagements, recap } = data;
  const [tab, setTab] = useState<"overview" | "activity">("overview");
  // Bookmark state — starts as false so server and client first render agree
  // (no hydration mismatch). The "adjust state during render" pattern
  // initialises from localStorage on the client without violating
  // react-hooks/set-state-in-effect, and a popcorn-listener bumps a counter
  // when bookmarks change elsewhere so this panel re-evaluates.
  const [bookmarkTick, setBookmarkTick] = useState(0);
  const [prevTick, setPrevTick] = useState(-1);
  const [prevCompanyId, setPrevCompanyId] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  if (prevTick !== bookmarkTick || prevCompanyId !== companyId) {
    setPrevTick(bookmarkTick);
    setPrevCompanyId(companyId);
    setBookmarked(isBookmarked(companyId));
  }
  useEffect(() => {
    function onChange() {
      setBookmarkTick((t) => t + 1);
    }
    window.addEventListener("ud-bookmarks-changed", onChange);
    return () => window.removeEventListener("ud-bookmarks-changed", onChange);
  }, []);
  const onToggleBookmark = () => {
    toggleBookmark({
      id: companyId,
      name: company?.name || "Unknown",
      domain: company?.domain || undefined,
    });
  };

  // Page-level Left/Right shortcuts dispatch a custom event so we can swap tabs
  // without lifting the tab state up.
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent<"prev" | "next">).detail;
      setTab((cur) => {
        if (detail === "next") return cur === "overview" ? "activity" : "overview";
        return cur === "activity" ? "overview" : "activity";
      });
    }
    window.addEventListener("ud-detail-tab", onSwitch as EventListener);
    return () => window.removeEventListener("ud-detail-tab", onSwitch as EventListener);
  }, []);

  // Broadcast the active tab to the page so its keyboard handler can decide
  // whether ↑/↓ should cycle the queue or scroll the activity feed.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ud-detail-tab-change", { detail: tab }));
    return () => {
      // Reset on unmount so a stale "activity" doesn't bleed over to the next view.
      window.dispatchEvent(new CustomEvent("ud-detail-tab-change", { detail: "overview" }));
    };
  }, [tab]);
  const ownerName = owners[company.hubspot_owner_id || ""] || "Unassigned";
  const ownerLocal = OWNER_MAP[company.hubspot_owner_id || ""] || null;

  // Quick-action wiring. Without write APIs to HubSpot, the dashboard makes
  // itself actionable by handing off context to the user's mail client /
  // phone / clipboard so they finish the task in one click instead of three.
  const health = fmtHealth(company.health_score);
  const actionCtx = {
    companyName: company.name || "",
    domain: company.domain,
    healthScoreLabel: health.label,
    healthScoreNum: health.num != null ? String(health.num) : null,
    mrr: deal?.confirmed__contract_mrr
      ? fmtMrr(parseFloat(deal.confirmed__contract_mrr))
      : null,
    payStatus: deal?.understory_pay_status__customer || null,
    primaryContact: data.primaryContact,
  };
  const emailUrl = composeEmailUrl(actionCtx);
  const summaryLine = companySummaryLine(actionCtx);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCopySummary = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(summaryLine).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const stageLabel = deal?.dealstage ? stages[deal.dealstage] || deal.dealstage : null;

  const wrapperStyle: React.CSSProperties = embedded
    ? { padding: "0", margin: 0, background: "transparent" }
    : {
        padding: "28px 32px",
        maxWidth: 1200,
        margin: "0 auto",
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
      };

  return (
    <div className="animate-fadeIn" style={wrapperStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          {stageLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 10.5,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--lichen)",
                  color: "var(--moss)",
                  fontWeight: 600,
                }}
              >
                {stageLabel}
              </span>
            </div>
          )}
          <h1
            style={{
              margin: "0 0 10px",
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 0.95,
              color: "var(--moss)",
              letterSpacing: 0,
            }}
          >
            {company.name}
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "var(--green-100)",
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {company.domain && (
              <a
                href={`https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--moss)", textDecoration: "underline" }}
              >
                https://{company.domain}
              </a>
            )}
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Avatar owner={ownerLocal} size={18} />
              {ownerName}
            </span>
            {company.understory_company_country && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{company.understory_company_country}</span>
              </>
            )}
            {company.notes_last_contacted && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>Last contacted {relDays(company.notes_last_contacted)}</span>
              </>
            )}
          </div>
          {data.primaryContact && (
            <div
              style={{
                fontSize: 13,
                color: "var(--green-100)",
                marginTop: 6,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "var(--moss)" }}>{data.primaryContact.name ?? "Primary contact"}</span>
              {data.primaryContact.email && (
                <>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <a
                    href={`mailto:${data.primaryContact.email}`}
                    style={{ color: "var(--moss)", textDecoration: "underline" }}
                  >
                    {data.primaryContact.email}
                  </a>
                </>
              )}
              {data.primaryContact.phone && (
                <>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <a
                    href={`tel:${data.primaryContact.phone.replace(/\s/g, "")}`}
                    style={{ color: "var(--moss)", textDecoration: "underline" }}
                  >
                    {data.primaryContact.phone}
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onToggleBookmark}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this company"}
            aria-pressed={bookmarked}
            title={bookmarked ? "Remove bookmark" : "Bookmark this company"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              fontSize: 16,
              border: "1px solid var(--hairline)",
              background: bookmarked ? "var(--citrus)" : "var(--card-bg)",
              color: "var(--moss)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            {bookmarked ? "★" : "☆"}
          </button>
          {emailUrl && (
            <a
              href={emailUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Compose in Gmail (recipient prefilled)"
              style={quickActionBtn}
            >
              ✉ Email
            </a>
          )}
          <button
            onClick={onCopySummary}
            title={`Copy summary to clipboard\n\n${summaryLine}`}
            style={{
              ...quickActionBtn,
              cursor: "pointer",
              background: copied ? "var(--citrus)" : "var(--card-bg)",
            }}
          >
            {copied ? "✓ Copied" : "⧉ Copy"}
          </button>
          <a
            href={hubspotCompanyUrl(companyId) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={quickActionBtn}
          >
            <Icon.External />
            Open in HubSpot
          </a>
        </div>
      </div>

      <MetricStrip company={company} deal={deal} />
      <RecapCardBig recap={recap} companyId={companyId} />

      <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--hairline)", marginBottom: 18 }}>
        {(["overview", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 0",
              fontSize: 13,
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: 700,
              color: tab === t ? "var(--moss)" : "var(--green-100)",
              marginBottom: -1,
              transition: "color 0.2s var(--ease-out), border-bottom-color 0.2s var(--ease-out)",
              background: "transparent",
              cursor: "pointer",
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor: tab === t ? "var(--moss)" : "transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPanel company={company} deal={deal} owners={owners} stages={stages} />}
      {tab === "activity" && <ActivityPanel engagements={engagements} owners={owners} />}
    </div>
  );
}

function OverviewPanel({
  company,
  deal,
  owners,
  stages,
}: {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  stages: StageMap;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <VolumeChart company={company} />
        <HealthRings company={company} />
        <PlatformActivityCard company={company} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PayPipelineCard company={company} deal={deal} />
        {/* OB Notes intentionally omitted from the company overview — they're
            relevant only inside the Onboarding meeting brief, not on the
            general company detail panel. */}
        <LifecycleDealCard deal={deal} stages={stages} />
        <CompanyInfoCard company={company} owners={owners} />
      </div>
    </div>
  );
}

// ObNotesCard / ObRow / Blocker were removed — onboarding notes belong on
// the Onboarding meeting brief, not the general company-detail panel. See
// `MeetingBriefCard` in `src/components/design/views/OnboardingView.tsx`.

function PlatformActivityCard({ company }: { company: Record<string, string> }) {
  const items = [
    { label: "Backoffice", value: company.understory_backoffice_latest_visit },
    { label: "Storefront", value: company.understory_storefront_latest_visit },
    { label: "Widget", value: company.understory_widget_latest_visit },
  ];
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: 20,
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
          marginBottom: 14,
        }}
      >
        Platform activity
      </div>
      {items.map((a, i) => {
        const date = a.value ? new Date(a.value) : null;
        const days = date && !isNaN(date.getTime())
          // eslint-disable-next-line react-hooks/purity -- relative date computed for display only
          ? Math.floor((Date.now() - date.getTime()) / 86400000)
          : null;
        const tone = days == null ? "var(--green-100)" : days <= 2 ? "var(--status-good-bold)" : days <= 14 ? "var(--status-warn-bold)" : "var(--rust)";
        return (
          <div
            key={a.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderBottom: i < items.length - 1 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone }} />
            <span style={{ fontSize: 13, color: "var(--moss)", fontWeight: 500 }}>{a.label}</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "var(--green-100)",
                fontStyle: "italic",
                fontFamily: "var(--font-editorial)",
              }}
            >
              {date && !isNaN(date.getTime()) ? relDays(a.value) : "No data"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PayPipelineCard({ company, deal }: { company: Record<string, string>; deal: Record<string, string> | null }) {
  const unwilling = company.understory_pay_unwilling === "true";
  const ineligible = company.understory_pay_ineligible === "true";
  const onboarding = company.understory_has_started_understory_pay_onboarding === "true";
  const verification = !!company.understory_pay_verification_status;
  const live = company.understory_pay_live === "true" || deal?.understory_pay_status__customer === "Live";

  let idx = 0;
  if (live) idx = 3;
  else if (verification) idx = 2;
  else if (onboarding) idx = 1;

  const stages = ["Not started", "Onboarding", "Verification", "Live"];

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: 20,
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
          marginBottom: 14,
        }}
      >
        Understory Pay
      </div>
      {unwilling ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--rust)" }}>Unwilling</div>
          {company.understory_pay_unwilling_reason && (
            <div style={{ fontSize: 12, color: "var(--green-100)", marginTop: 4 }}>
              {company.understory_pay_unwilling_reason}
            </div>
          )}
        </div>
      ) : ineligible ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--status-warn-fg)" }}>Ineligible</div>
          {company.understory_pay_ineligible_reason && (
            <div style={{ fontSize: 12, color: "var(--green-100)", marginTop: 4 }}>
              {company.understory_pay_ineligible_reason}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {stages.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: i === stages.length - 1 ? "0 0 auto" : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: i <= idx ? "var(--moss)" : "var(--beige-gray)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: i <= idx ? 600 : 400,
                    color: i <= idx ? "var(--moss)" : "var(--green-100)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: i < idx ? "var(--moss)" : "var(--beige-gray)",
                    margin: "0 8px",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LifecycleDealCard({ deal, stages }: { deal: Record<string, string> | null; stages: StageMap }) {
  if (!deal) {
    return (
      <CardShell title="Lifecycle deal">
        <p style={{ fontSize: 12, color: "var(--green-100)" }}>No lifecycle deal found.</p>
      </CardShell>
    );
  }
  const rows: { label: string; value: string }[] = [];
  if (deal.dealstage) rows.push({ label: "Stage", value: stages[deal.dealstage] || deal.dealstage });
  if (deal.confirmed__contract_mrr) rows.push({ label: "Monthly fee", value: fmtMrr(parseFloat(deal.confirmed__contract_mrr)) });
  if (deal.confirmed_booking_fee || deal.booking_fee) {
    const raw = parseFloat(deal.confirmed_booking_fee || deal.booking_fee || "0");
    if (!isNaN(raw)) rows.push({ label: "Booking fee", value: `${(raw < 1 ? raw * 100 : raw).toFixed(2)}%` });
  }
  if (deal.understory_pay_status__customer) rows.push({ label: "Pay status", value: deal.understory_pay_status__customer });
  return (
    <CardShell
      title="Lifecycle deal"
      headerRight={
        deal.hs_object_id ? (
          <a
            href={hubspotDealUrl(deal.hs_object_id) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: "var(--moss)", textDecoration: "underline" }}
          >
            Open in HubSpot
          </a>
        ) : null
      }
    >
      {rows.map((r) => (
        <InfoRow key={r.label} label={r.label} value={r.value} />
      ))}
    </CardShell>
  );
}

function CompanyInfoCard({ company, owners }: { company: Record<string, string>; owners: OwnerMap }) {
  const ownerLocal = OWNER_MAP[company.hubspot_owner_id || ""] || null;
  const region = ownerLocal?.region || "Unknown";
  const rows: { label: string; value: string; link?: boolean }[] = [];
  if (company.domain) rows.push({ label: "Domain", value: `https://${company.domain}`, link: true });
  rows.push({ label: "Owner", value: owners[company.hubspot_owner_id || ""] || "Unassigned" });
  rows.push({ label: "Region", value: region });
  if (company.understory_company_country) rows.push({ label: "Country", value: company.understory_company_country });
  if (company.notes_last_contacted) rows.push({ label: "Last contacted", value: relDays(company.notes_last_contacted) });
  if (company.understory_total_number_of_transactions) rows.push({ label: "Transactions", value: parseInt(company.understory_total_number_of_transactions).toLocaleString() });
  if (company.understory_booking_volume_all_time) {
    const v = parseFloat(company.understory_booking_volume_all_time);
    if (!isNaN(v) && v > 0) rows.push({ label: "All-time volume", value: `€${Math.round(v).toLocaleString()}` });
  }
  return (
    <CardShell title="Company info">
      {rows.map((r) => (
        <InfoRow key={r.label} label={r.label} value={r.value} link={r.link} />
      ))}
    </CardShell>
  );
}

function CardShell({ title, children, headerRight }: { title: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: "16px 20px 4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--green-100)",
          }}
        >
          {title}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--green-100)" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: "var(--moss)",
          fontWeight: 500,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--moss)", textDecoration: "underline" }}>
            {value}
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

interface GongStructured {
  meta?: string;
  brief?: string;
  points: { title?: string; body: string }[];
  steps: string[];
}

// Parse a Gong-format meeting summary into sections. Returns null when the
// summary doesn't look like Gong, so we fall back to plain text.
function parseGong(text: string | undefined | null): GongStructured | null {
  if (!text || !/Call highlights by Gong/i.test(text)) return null;

  const meta = text.match(/Took place on:?\s*([\s\S]+?)\s+--\s+Call highlights/i)?.[1]?.trim();
  const brief = text
    .match(/Call brief:\s*([\s\S]+?)(?=Key Discussion Points:|Next steps:|$)/i)?.[1]
    ?.trim();

  const pointsBlock = text
    .match(/Key Discussion Points:\s*([\s\S]+?)(?=Next steps:|$)/i)?.[1]
    ?.trim();
  const points: GongStructured["points"] = [];
  if (pointsBlock) {
    // Split on "<digits>." boundaries while keeping the rest of each item.
    const chunks = pointsBlock.split(/\s+(?=\d+\.\s)/);
    for (const raw of chunks) {
      const cleaned = raw.replace(/^\d+\.\s*/, "").trim();
      if (!cleaned) continue;
      const colonIdx = cleaned.indexOf(":");
      if (colonIdx > 0 && colonIdx < 80) {
        points.push({
          title: cleaned.slice(0, colonIdx).trim(),
          body: cleaned.slice(colonIdx + 1).trim(),
        });
      } else {
        points.push({ body: cleaned });
      }
    }
  }

  const stepsBlock = text.match(/Next steps:\s*([\s\S]+)$/i)?.[1]?.trim();
  const steps = stepsBlock
    ? stepsBlock
        .split(/\s*\*\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return { meta, brief, points, steps };
}

function GongCard({ gong }: { gong: GongStructured }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {gong.meta && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {gong.meta}
        </div>
      )}
      {gong.brief && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--dark-moss)", lineHeight: 1.6 }}>
          {gong.brief}
        </p>
      )}
      {gong.points.length > 0 && (
        <div>
          <SectionHead>Key discussion points</SectionHead>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {gong.points.map((p, i) => (
              <li key={i} style={{ fontSize: 13, color: "var(--dark-moss)", lineHeight: 1.55 }}>
                {p.title && (
                  <strong style={{ color: "var(--moss)", fontWeight: 600 }}>{p.title}: </strong>
                )}
                {p.body}
              </li>
            ))}
          </ol>
        </div>
      )}
      {gong.steps.length > 0 && (
        <div>
          <SectionHead accent>Next steps</SectionHead>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {gong.steps.map((s, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--dark-moss)",
                  lineHeight: 1.55,
                  background: "rgba(241,249,126,0.18)",
                  border: "1px solid rgba(241,249,126,0.5)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionHead({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        textTransform: "uppercase",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: accent ? "var(--moss)" : "var(--green-100)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function actionVerb(type: "call" | "meeting" | "note" | "email"): string {
  if (type === "call") return "Called";
  if (type === "email") return "Emailed";
  if (type === "meeting") return "Hosted";
  return "Noted";
}

interface ActivityViewItem {
  id: string;
  type: "call" | "meeting" | "note" | "email";
  title: string;
  timestamp: string;
  /** Display text for the body (HTML stripped). For emails, this is the latest message body. */
  body: string;
  /** Pre-computed AI summary (when present), otherwise empty. */
  summary: string;
  /** HubSpot owner id (resolved to a name in the activity card). */
  owner: string | undefined;
  /** For emails: every message in the thread, sorted ASC by timestamp. */
  thread?: { id: string; timestamp: string; body: string; direction: string | null }[];
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<a\s+[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// HTML → text that preserves paragraph breaks so we can detect signatures /
// reply quotes line-by-line. Drop blockquotes since they're always replies.
function stripEmailHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<a\s+[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripEmailReply(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const QUOTE_HEADER = [
    /^On\s+.+(\s+at\s+.+)?\s+wrote:?\s*$/i,
    /^Den\s+.+\s+skrev\s+.+:?\s*$/i,
    /^P[åa]\s+.+\s+skrev\s+.+:?\s*$/i,
    /^D\.\s+.+\s+skrev\s+.+:?\s*$/i,
    /^Le\s+.+\s+a\s+écrit\s*:?\s*$/i,
    /^Am\s+.+\s+schrieb\s+.+:?\s*$/i,
    /^From:\s+.+/i,
    /^_{3,}\s*$/,
    /^\s*-{2,}\s*Original\s+Message\s*-{2,}\s*$/i,
  ];
  const SIGNOFF = [
    /^\s*(best( regards)?|regards|thanks|thank you|cheers|kind regards|sincerely|br)[,!.]?\s*$/i,
    /^\s*(med vänliga hälsningar|m\.?v\.?h\.?|vänligen|hälsningar|tack)[,!.]?\s*$/i,
    /^\s*(hilsen|venlig hilsen|v\.?h\.?|takk|hyggelig|de bedste hilsner|venligst)[,!.]?\s*$/i,
    /^\s*(viele grüße|mit freundlichen grüßen|gruß|freundliche grüße)[,!.]?\s*$/i,
    /^\s*(cordialement|amicalement|salutations distinguées|bien cordialement)[,!.]?\s*$/i,
  ];
  const SENT_FROM = /^\s*(sent|skickat|gesendet|envoyé|enviado)\s+from\s+my\s+(iphone|ipad|android|mobile|blackberry|samsung)/i;
  const SIG_DELIM = /^\s*--\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (SIG_DELIM.test(raw)) break;
    if (SENT_FROM.test(line)) break;
    if (QUOTE_HEADER.some((p) => p.test(line))) break;
    if (SIGNOFF.some((p) => p.test(line))) break;
    if (line.startsWith(">")) continue;
    out.push(raw);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanEmailBody(raw: string | null | undefined): string {
  return stripEmailReply(stripEmailHtml(raw));
}

function normaliseDirection(d: string | null | undefined): "INBOUND" | "OUTBOUND" | null {
  if (!d) return null;
  const u = d.toUpperCase();
  if (u === "INBOUND" || u === "INCOMING_EMAIL") return "INBOUND";
  if (u === "OUTBOUND" || u === "EMAIL" || u === "FORWARDED_EMAIL") return "OUTBOUND";
  return null;
}

function fmtThreadTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} · ${time}`;
}

function dirLabel(d: "INBOUND" | "OUTBOUND" | null): string {
  if (d === "INBOUND") return "from customer";
  if (d === "OUTBOUND") return "from us";
  return "";
}

function EmailThreadCard({
  thread,
}: {
  thread: { id: string; timestamp: string; body: string; direction: string | null }[];
}) {
  if (!thread || thread.length === 0) return null;
  const sorted = [...thread].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const earlier = sorted.slice(0, -1).reverse();

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const startStr = fmtDate(sorted[0].timestamp);
  const endStr = fmtDate(latest.timestamp);
  const dateRange = startStr === endStr ? startStr : `${startStr} → ${endStr}`;

  const directions = sorted.map((m) => normaliseDirection(m.direction));
  const inbound = directions.filter((d) => d === "INBOUND").length;
  const outbound = directions.filter((d) => d === "OUTBOUND").length;
  let participants = "";
  if (inbound > 0 && outbound > 0) participants = "two-way";
  else if (outbound > 0) participants = "outbound only";
  else if (inbound > 0) participants = "customer inbound";

  const meta = [dateRange, `${sorted.length} message${sorted.length === 1 ? "" : "s"}`, participants]
    .filter(Boolean)
    .join(" · ");

  const latestDir = normaliseDirection(latest.direction);
  const latestBody = cleanEmailBody(latest.body);
  const latestMetaLine = [fmtThreadTime(latest.timestamp), dirLabel(latestDir)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {meta && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {meta}
        </div>
      )}
      <div>
        <SectionHead>Latest message</SectionHead>
        {latestMetaLine && (
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-100)",
              marginBottom: 6,
            }}
          >
            {latestMetaLine}
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--dark-moss)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {latestBody || (
            <span style={{ fontStyle: "italic", color: "var(--green-100)" }}>(empty body)</span>
          )}
        </p>
      </div>
      {earlier.length > 0 && (
        <div>
          <SectionHead>Earlier in thread</SectionHead>
          <ul
            style={{
              margin: "6px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {earlier.map((m) => {
              const dir = normaliseDirection(m.direction);
              const meta = [fmtThreadTime(m.timestamp), dirLabel(dir)].filter(Boolean).join(" · ");
              const body = cleanEmailBody(m.body);
              return (
                <li
                  key={m.id}
                  style={{
                    background: "var(--beige-new)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {meta && (
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        textTransform: "uppercase",
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--green-100)",
                        marginBottom: 4,
                      }}
                    >
                      {meta}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--dark-moss)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {body || (
                      <span style={{ fontStyle: "italic", color: "var(--green-100)" }}>(empty body)</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function normaliseThreadSubject(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 8; i++) {
    const stripped = s.replace(
      /^\s*(re|fw|fwd|sv|vs|antw|antwort|tr|rv|aw|wg|fae|vl|videresend)[:\s][:\s]*/i,
      ""
    );
    if (stripped === s) break;
    s = stripped;
  }
  return s.trim().toLowerCase();
}

function isGongMeeting(title: string, body: string): boolean {
  if ((title || "").toLowerCase().includes("[gong]")) return true;
  if (body && /Call highlights by Gong/i.test(body)) return true;
  return false;
}

const NOISE_PREFIXES = [
  "accepted:", "tentative:", "tentatively accepted:", "declined:",
  "canceled:", "cancelled:", "rescheduled:",
  "re: accepted:", "re: declined:", "re: tentative:",
];
function isNoisySubject(s: string | null | undefined): boolean {
  if (!s) return false;
  const norm = s.toLowerCase().trim();
  return NOISE_PREFIXES.some((p) => norm.startsWith(p));
}

function transformActivity(engagements: Engagement[]): ActivityViewItem[] {
  // Step 1: drop bare meeting invitations + noise subjects.
  const filtered = engagements.filter((e) => {
    if (isNoisySubject(e.title)) return false;
    if (e.type === "meeting") {
      const body = e.summary || e.bodyPreview || e.body || "";
      if (isGongMeeting(e.title, body)) return true;
      // No Gong tag and nothing in the body = bare calendar invite. Drop it.
      if (!body || body.trim().length < 30) return false;
    }
    return true;
  });

  // Step 2: dedupe meeting+Gong pairs (same time within 10 min).
  const sortedAsc = [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const drop = new Set<number>();
  for (let i = 0; i < sortedAsc.length; i++) {
    if (drop.has(i)) continue;
    if (sortedAsc[i].type !== "meeting") continue;
    const a = sortedAsc[i];
    const aIsGong = isGongMeeting(a.title, a.summary || a.bodyPreview || a.body || "");
    for (let j = i + 1; j < sortedAsc.length; j++) {
      const b = sortedAsc[j];
      if (b.type !== "meeting") continue;
      const dt = Math.abs(new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (dt > 10 * 60 * 1000) break;
      const bIsGong = isGongMeeting(b.title, b.summary || b.bodyPreview || b.body || "");
      if (aIsGong && !bIsGong) drop.add(j);
      else if (bIsGong && !aIsGong) {
        drop.add(i);
        break;
      }
    }
  }
  const deduped = sortedAsc.filter((_, i) => !drop.has(i));

  // Step 3: split off emails for threading.
  const emails = deduped.filter((e) => e.type === "email");
  const others = deduped.filter((e) => e.type !== "email");

  const threadGroups = new Map<string, Engagement[]>();
  for (const e of emails) {
    const key = normaliseThreadSubject(e.title || "");
    const arr = threadGroups.get(key) || [];
    arr.push(e);
    threadGroups.set(key, arr);
  }
  const threadItems: ActivityViewItem[] = [];
  let threadCounter = 0;
  for (const [, list] of threadGroups) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const head = list[list.length - 1];
    const cleanedTitle =
      head.title.replace(
        /^\s*(re|fw|fwd|sv|vs|antw|antwort|tr|rv|aw|wg|fae|vl|videresend)[:\s][:\s]*/i,
        ""
      ).trim() || head.title;
    const threadIdx = threadCounter++;
    threadItems.push({
      id: `thread:${threadIdx}:${head.timestamp}`,
      type: "email",
      title: cleanedTitle,
      timestamp: head.timestamp,
      body: stripHtml(head.body || head.bodyPreview),
      summary: head.summary || "",
      // Latest message owner — usually who replied last on Understory's side.
      owner: head.owner,
      thread: list.map((m, mi) => ({
        id: `thread:${threadIdx}:${mi}`,
        timestamp: m.timestamp,
        // Keep raw — EmailThreadCard runs cleanEmailBody to preserve line breaks
        // for signature/quote detection.
        body: m.body || m.bodyPreview || "",
        direction: m.direction ?? null,
      })),
    });
  }

  // Step 4: convert non-email items. Index suffix guards against duplicate
  // (timestamp, title) pairs — HubSpot can return multiple calls / notes that
  // share both fields exactly.
  const otherItems: ActivityViewItem[] = others.map((e, i) => ({
    id: `other:${i}:${e.timestamp}`,
    type: e.type,
    title: e.title || "(No subject)",
    timestamp: e.timestamp,
    body: stripHtml(e.body || e.bodyPreview),
    summary: e.summary || "",
    owner: e.owner,
  }));

  return [...threadItems, ...otherItems].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
}

function ActivityPanel({ engagements, owners }: { engagements: Engagement[]; owners: OwnerMap }) {
  const items = useMemo(() => transformActivity(engagements), [engagements]);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ↑/↓ — move focus, scroll into view.
  useEffect(() => {
    function onNav(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      setFocusedIdx((prev) => {
        if (items.length === 0) return prev;
        const next =
          dir === "next"
            ? Math.min(prev + 1, items.length - 1)
            : Math.max(prev - 1, 0);
        requestAnimationFrame(() => {
          itemRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        return next;
      });
    }
    window.addEventListener("ud-activity-nav", onNav);
    return () => window.removeEventListener("ud-activity-nav", onNav);
  }, [items.length]);

  // Space — toggle expanded state for the focused item.
  useEffect(() => {
    function onExpand() {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(focusedIdx)) next.delete(focusedIdx);
        else next.add(focusedIdx);
        return next;
      });
    }
    window.addEventListener("ud-activity-expand", onExpand);
    return () => window.removeEventListener("ud-activity-expand", onExpand);
  }, [focusedIdx]);

  if (items.length === 0) {
    return (
      <div
        style={{
          background: "var(--light-grey)",
          border: "1px solid var(--beige-gray)",
          borderRadius: 16,
          padding: 22,
          textAlign: "center",
          color: "var(--green-100)",
          fontStyle: "italic",
          fontFamily: "var(--font-editorial)",
        }}
      >
        No recent activity.
      </div>
    );
  }

  const colors: Record<ActivityViewItem["type"], { bg: string; fg: string }> = {
    call: { bg: "var(--event-call-bg)", fg: "var(--event-call-fg)" },
    meeting: { bg: "var(--event-meeting-bg)", fg: "var(--event-meeting-fg)" },
    note: { bg: "var(--beige)", fg: "var(--moss)" },
    email: { bg: "var(--lichen)", fg: "var(--moss)" },
  };

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {items.map((item, i) => {
        const c = colors[item.type];
        const gong =
          item.type === "meeting" ? parseGong(item.summary || item.body) : null;
        const isThread = item.type === "email" && (item.thread?.length ?? 0) > 0;
        const isFocused = i === focusedIdx;
        const isExpanded = expanded.has(i);
        const expandable = isThread || gong != null;

        return (
          <div
            key={item.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            style={{
              padding: "16px 18px",
              borderBottom: i < items.length - 1 ? "1px solid var(--hairline)" : "none",
              display: "flex",
              gap: 14,
              background: isFocused ? "var(--beige-new)" : "transparent",
              boxShadow: isFocused ? "inset 3px 0 0 var(--moss)" : "none",
              transition: "background 140ms ease, box-shadow 140ms ease",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  background: c.bg,
                  color: c.fg,
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "3px 7px",
                  borderRadius: 6,
                  textTransform: "capitalize",
                }}
              >
                {item.type === "email" ? "Email" : item.type}
              </span>
              {item.owner && owners[item.owner] && (
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--green-100)",
                    fontFamily: "var(--font-editorial)",
                    fontStyle: "italic",
                    whiteSpace: "nowrap",
                  }}
                  title={`${actionVerb(item.type)} by ${owners[item.owner]}`}
                >
                  by {owners[item.owner].split(" ")[0]}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--moss)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {item.title}
                  {isThread && item.thread!.length > 1 && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11.5,
                        color: "var(--green-100)",
                        fontFamily: "var(--font-editorial)",
                        fontStyle: "italic",
                        fontWeight: 400,
                      }}
                    >
                      · {item.thread!.length} messages
                    </span>
                  )}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {expandable && (
                    <button
                      onClick={() => toggle(i)}
                      style={{
                        fontFamily: "var(--font-display)",
                        textTransform: "uppercase",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--moss)",
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--beige-new)",
                        border: "1px solid var(--beige-gray)",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Hide" : "Read more"}
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--green-100)",
                      fontStyle: "italic",
                      fontFamily: "var(--font-editorial)",
                    }}
                  >
                    {relDays(item.timestamp)}
                  </span>
                </div>
              </div>

              {/* Default body (collapsed) */}
              {!isExpanded && gong && (
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "var(--dark-moss)",
                    lineHeight: 1.55,
                    fontFamily: "var(--font-editorial)",
                    fontStyle: "italic",
                  }}
                >
                  {gong.brief && gong.brief.length > 240
                    ? gong.brief.slice(0, 240).trim() + "…"
                    : gong.brief || (item.summary || "Click 'Read more' for the full call summary")}
                </p>
              )}
              {!isExpanded && !gong && isThread && (
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "var(--dark-moss)",
                    lineHeight: 1.55,
                  }}
                >
                  {(() => {
                    const last = item.thread![item.thread!.length - 1];
                    const dir = normaliseDirection(last.direction);
                    const prefix =
                      dir === "INBOUND"
                        ? "Latest reply: "
                        : dir === "OUTBOUND"
                          ? "Latest sent: "
                          : "Latest: ";
                    const txt = cleanEmailBody(last.body).replace(/\s+/g, " ").slice(0, 220).trim();
                    return `${prefix}${txt}${txt.length === 220 ? "…" : ""}`;
                  })()}
                </p>
              )}
              {!isExpanded && !gong && !isThread && (item.summary || item.body) && (
                <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--dark-moss)", lineHeight: 1.55 }}>
                  {item.summary || item.body}
                </p>
              )}

              {/* Expanded views */}
              {isExpanded && gong && (
                <div style={{ marginTop: 12 }}>
                  <GongCard gong={gong} />
                </div>
              )}
              {isExpanded && isThread && (
                <div style={{ marginTop: 12 }}>
                  <EmailThreadCard thread={item.thread!} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
