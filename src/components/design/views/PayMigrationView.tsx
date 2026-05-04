"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { PayMigrationData, PayDeal, PayOwnerSummary, PayStage, CompanySearchResult } from "@/lib/types";
import { CountUpPct, AnimBar, Stagger } from "../Motion";
import { DashboardBanner } from "../DashboardBanner";
import { Kpi } from "../Kpi";

type PayFilter = "default" | "all" | string; // "default" = key owners, "all" = everyone, otherwise ownerId

interface Props {
  data: PayMigrationData;
  payFilter: PayFilter;
  isRefreshing: boolean;
  onDealClick: (deal: PayDeal) => void;
}

const KEY_OWNER_IDS = new Set(["962517007", "559364799"]); // Anders, Cecilia

// Stage taxonomy + display config.
// Palette is a tonal journey, not a rainbow: deep moss (live) → lichen → warm
// amber (in motion) → muted lichen/beige (waiting) → cool grey (out of scope).
// All values tested for ≥3:1 against --card-bg (#F8F6ED).
const STAGE_ORDER: { key: PayStage; short: string; color: string }[] = [
  { key: "Live", short: "Live", color: "var(--pay-stage-live)" },
  { key: "Verified", short: "Verified", color: "var(--pay-stage-verified)" },
  { key: "Pending Verification", short: "Pending", color: "var(--pay-stage-pending)" },
  { key: "Started Onboarding", short: "Started Onb.", color: "var(--pay-stage-onboarding)" },
  { key: "Signed - Not Started", short: "Signed", color: "var(--pay-stage-signed)" },
  { key: "Not yet enrolled", short: "Not enrolled", color: "var(--pay-stage-none)" },
  { key: "Unwilling", short: "Unwilling", color: "var(--pay-stage-unwilling)" },
  { key: "Ineligible", short: "Ineligible", color: "var(--pay-stage-ineligible)" },
];

const STAGE_BY_KEY: Record<string, { color: string; short: string }> = Object.fromEntries(
  STAGE_ORDER.map((s) => [s.key, s])
);

const LIVE_STAGES: PayStage[] = ["Live", "Verified"];
const PUSH_STAGES: PayStage[] = ["Signed - Not Started", "Pending Verification"];

function fmtEurShort(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}k`;
  return `€${Math.round(v)}`;
}

function bvWithPct(v: number, denom: number): string {
  const p = denom > 0 ? (v / denom) * 100 : 0;
  return `${fmtEurShort(v)} (${p.toFixed(1)}%)`;
}

function ownerFullName(name: string): string {
  // Verified against HubSpot search_owners.
  const NAMES: Record<string, string> = {
    Anders: "Anders Hansen",
    Cecilia: "Cecilia Lexe",
    Filip: "Filip Torstensson",
    Marc: "Marc Møller Nielsen",
  };
  const first = name.split(" ")[0];
  return NAMES[first] || name;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Memoized — see MeetingPrepView. Pay migration data identity changes
// only on refetch.
export const PayMigrationView = memo(function PayMigrationViewImpl({ data, payFilter, isRefreshing, onDealClick }: Props) {
  // Decide which owners to render in per-owner sections
  const breakoutOwners: PayOwnerSummary[] = useMemo(() => {
    if (payFilter === "default") {
      return data.owners.filter((o) => KEY_OWNER_IDS.has(o.ownerId));
    }
    if (payFilter === "all") return data.owners;
    return data.owners.filter((o) => o.ownerId === payFilter);
  }, [data.owners, payFilter]);

  // Top-line KPIs reflect filtered owners (default + all both show org-wide totals)
  const topline = useMemo(() => {
    if (payFilter === "default" || payFilter === "all") {
      return {
        eligibleBv: data.eligibleBv,
        totalAcv: data.totalAcv,
        liveVerifiedAcv: data.liveVerifiedAcv,
        liveVerifiedBv: data.liveVerifiedBv,
        inProgressBv: data.inProgressBv,
        ineligibleBv: data.ineligibleBv,
        pctLc: data.bvLiveVerifiedPercent,
        pctProg: data.bvInProgressPercent,
        pctAcv: data.arrLiveVerifiedPercent,
        deals: data.allDeals,
      };
    }
    const ownerStats = data.owners.find((o) => o.ownerId === payFilter);
    if (!ownerStats) {
      return {
        eligibleBv: 0, totalAcv: 0, liveVerifiedAcv: 0, liveVerifiedBv: 0,
        inProgressBv: 0, ineligibleBv: 0, pctLc: 0, pctProg: 0, pctAcv: 0, deals: [],
      };
    }
    const liveBv = LIVE_STAGES.reduce((s, k) => s + (ownerStats.stageCounts[k]?.bv || 0), 0);
    const progBv = PUSH_STAGES.reduce((s, k) => s + (ownerStats.stageCounts[k]?.bv || 0), 0)
      + (ownerStats.stageCounts["Started Onboarding"]?.bv || 0);
    return {
      eligibleBv: ownerStats.eligibleBv,
      totalAcv: ownerStats.deals.reduce((s, d) => s + d.acv, 0),
      liveVerifiedAcv: ownerStats.deals
        .filter((d) => LIVE_STAGES.includes(d.stage))
        .reduce((s, d) => s + d.acv, 0),
      liveVerifiedBv: liveBv,
      inProgressBv: progBv,
      ineligibleBv: ownerStats.stageCounts["Ineligible"]?.bv || 0,
      pctLc: ownerStats.lcPercent,
      pctProg: ownerStats.inProgressPercent,
      pctAcv: ownerStats.arrPercent,
      deals: ownerStats.deals,
    };
  }, [data, payFilter]);

  const gapToTarget = Math.max(0, data.targetPct - topline.pctLc);

  return (
    <div
      className={`animate-fadeIn${isRefreshing ? " is-revalidating" : ""}`}
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      <DashboardBanner
        eyebrow="Pay migration"
        maxWidth={1280}
        headline={
          <>
            Moving {topline.deals.length} {topline.deals.length === 1 ? "deal" : "deals"} to Understory Pay.
          </>
        }
        detail={
          <>
            <span
              style={{
                color: "var(--citrus)",
                borderBottom: "1px dashed color-mix(in oklch, var(--citrus) 55%, transparent)",
                paddingBottom: 1,
              }}
            >
              {Math.round(topline.pctLc)}% live or verified
            </span>
            {" "}of eligible book value. Adopted stage and beyond.
            {data.updatedAt && <> Updated {timeAgo(data.updatedAt)}.</>}
          </>
        }
      />

      <div style={{ padding: "20px 28px 60px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* KPI CARDS */}
        <Stagger
          delay={70}
          initial={120}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}
        >
          <Kpi
            label="BV live / verified"
            value={<CountUpPct value={topline.pctLc} />}
            sub={`${fmtEurShort(topline.liveVerifiedBv)} of ${fmtEurShort(topline.eligibleBv)} eligible`}
            tone="good"
          />
          <Kpi
            label="BV in progress"
            value={<CountUpPct value={topline.pctProg} />}
            sub={`${fmtEurShort(topline.liveVerifiedBv + topline.inProgressBv)} of ${fmtEurShort(topline.eligibleBv)}`}
          />
          <Kpi
            label="ARR live / verified"
            value={<CountUpPct value={topline.pctAcv} />}
            sub={`${fmtEurShort(topline.liveVerifiedAcv)} of ${fmtEurShort(topline.totalAcv)}`}
            tone="accent"
          />
          <Kpi
            label="Target May"
            value={`${data.targetPct}%`}
            sub={<GapPill ppToGo={gapToTarget} />}
          />
        </Stagger>

        {/* PIPELINE BAR */}
        <SectionTitle title="Full pipeline" subtitle="BV breakdown across stages" />
        <PipelineBar stageBreakdown={data.stageBreakdown} ineligibleBv={data.ineligibleBv} />

        {/* OVERVIEW BY OWNER */}
        <SectionTitle title="Overview by owner" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(breakoutOwners.length + 1, 4)}, 1fr)`,
            gap: 14,
            marginBottom: 32,
          }}
        >
          <OwnerCard
            name={payFilter === "all" || payFilter === "default" ? "All owners" : "Selected"}
            stats={{
              totalBv: payFilter === "default" || payFilter === "all" ? data.totalBv : topline.eligibleBv + topline.ineligibleBv,
              eligBv: topline.eligibleBv,
              pctLc: topline.pctLc,
              pctAcv: topline.pctAcv,
              stageCounts: aggregateStageCounts(topline.deals),
            }}
          />
          {breakoutOwners.map((o) => (
            <OwnerCard
              key={o.ownerId}
              name={ownerFullName(o.ownerName)}
              stats={{
                totalBv: o.totalBv,
                eligBv: o.eligibleBv,
                pctLc: o.lcPercent,
                pctAcv: o.arrPercent,
                stageCounts: o.stageCounts,
              }}
            />
          ))}
        </div>

        {/* VERIFIED / LIVE */}
        <SectionTitle title="Migrated customers - Verified / Live" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(Math.max(breakoutOwners.length, 1), 2)}, 1fr)`,
            gap: 14,
            marginBottom: 32,
          }}
        >
          {breakoutOwners.map((o) => (
            <PathCard
              key={`live-${o.ownerId}`}
              name={ownerFullName(o.ownerName)}
              owner={o}
              targetPct={data.targetPct}
              allEligBv={data.eligibleBv}
              onDealClick={onDealClick}
              mode="live"
            />
          ))}
        </div>

        {/* PATH TO TARGET */}
        <SectionTitle title={`Path to ${data.targetPct}%`} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(Math.max(breakoutOwners.length, 1), 2)}, 1fr)`,
            gap: 14,
            marginBottom: 32,
          }}
        >
          {breakoutOwners.map((o) => (
            <PathCard
              key={o.ownerId}
              name={ownerFullName(o.ownerName)}
              owner={o}
              targetPct={data.targetPct}
              allEligBv={data.eligibleBv}
              onDealClick={onDealClick}
            />
          ))}
        </div>

        {/* UNWILLING */}
        <SectionTitle title="Unwilling" subtitle="Customers who declined, with reasons" />
        <UnwillingTable
          deals={data.unwilling.filter((d) =>
            payFilter === "all" || payFilter === "default"
              ? true
              : d.ownerId === payFilter
          )}
          allEligBv={data.eligibleBv}
          onDealClick={onDealClick}
        />

        {/* NOT YET ENROLLED */}
        <SectionTitle title="Not yet enrolled" subtitle="Top by BV, no Pay status in HubSpot" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(Math.max(breakoutOwners.length, 1), 2)}, 1fr)`,
            gap: 14,
          }}
        >
          {breakoutOwners.map((o) => {
            const ne = data.notEnrolled
              .filter((d) => d.ownerId === o.ownerId)
              .sort((a, b) => b.bv - a.bv);
            return (
              <NotEnrolledCard
                key={o.ownerId}
                name={ownerFullName(o.ownerName)}
                deals={ne}
                allEligBv={data.eligibleBv}
                onDealClick={onDealClick}
              />
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
});

function aggregateStageCounts(deals: PayDeal[]): Record<PayStage, { count: number; bv: number }> {
  const out = {} as Record<PayStage, { count: number; bv: number }>;
  for (const d of deals) {
    if (!out[d.stage]) out[d.stage] = { count: 0, bv: 0 };
    out[d.stage].count += 1;
    out[d.stage].bv += d.bv;
  }
  return out;
}

/* ---------------- atoms ---------------- */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--moss)",
          textTransform: "uppercase",
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <span
          style={{
            fontSize: 12.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

// Sub-line renderer for the migration target tile. The previous tone="warn"
// painted the whole tile rust which read as "this metric is broken" instead of
// "you have ground to cover". Now the value sits in moss; the gap rides as a
// small rust pill below it, only when there's actually ground to cover.
function GapPill({ ppToGo }: { ppToGo: number }) {
  const formatted = ppToGo.toFixed(1).replace(/\.0$/, "");
  if (ppToGo <= 0) {
    return <span style={{ color: "var(--green-100)" }}>on target</span>;
  }
  return (
    <span
      style={{
        display: "inline-block",
        background: "var(--rust)",
        color: "var(--page-bg)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "2px 7px",
        borderRadius: 999,
        fontFamily: "var(--font-display)",
        textTransform: "uppercase",
        fontStyle: "normal",
      }}
    >
      {formatted}pp to go
    </span>
  );
}

function Flag({ kind }: { kind: "summer" | "invoice" | "noevents" }) {
  // Pull tints from the design-token data-viz palette instead of the
  // hand-picked Bootstrap-warning hex set the chips used to ship with.
  // Lichen / sky-blue / lilac come from DESIGN.md §2 (data-viz palette).
  // Each chip carries its own tooltip so meaning survives outside the
  // legend block at the top of the page (a row 200px down the table is
  // out of legend context otherwise).
  const styles: Record<
    typeof kind,
    { bg: string; fg: string; text: string; title: string }
  > = {
    summer: {
      bg: "var(--beige)",
      fg: "var(--moss)",
      text: "☀ SUMMER",
      title: "Customer is on summer break and will not migrate before autumn.",
    },
    invoice: {
      bg: "var(--sky-blue)",
      fg: "var(--moss)",
      text: "INVOICE",
      title: "Has an open invoice in HubSpot. Resolve before pushing on Pay.",
    },
    noevents: {
      bg: "var(--lilac)",
      fg: "var(--moss)",
      text: "0 EVENTS",
      title: "Zero upcoming events on the storefront. Pay migration is moot until they're booking.",
    },
  };
  const s = styles[kind];
  return (
    <span
      title={s.title}
      style={{
        display: "inline-block",
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: s.bg,
        color: s.fg,
        marginLeft: 4,
        verticalAlign: "middle",
        cursor: "help",
      }}
    >
      {s.text}
    </span>
  );
}

function FlagsFor({ deal }: { deal: PayDeal }) {
  const isPushStage = (
    ["Not yet enrolled", "Signed - Not Started", "Pending Verification"] as PayStage[]
  ).includes(deal.stage);
  const flags: React.ReactNode[] = [];
  if (isPushStage) {
    if (deal.hasOpenInvoice) flags.push(<Flag key="i" kind="invoice" />);
    if (deal.zeroEvents) flags.push(<Flag key="z" kind="noevents" />);
  }
  return <>{flags}</>;
}

function StageDot({ stage }: { stage: PayStage }) {
  const s = STAGE_BY_KEY[stage];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: s?.color || "var(--green-muted)",
        marginRight: 5,
        verticalAlign: "middle",
      }}
    />
  );
}

function StageLabel({ stage }: { stage: PayStage }) {
  return (
    <span style={{ fontSize: 11.5, color: "var(--moss)" }}>
      <StageDot stage={stage} />
      {stage}
    </span>
  );
}

/* ---------------- pipeline bar ---------------- */

function PipelineBar({
  stageBreakdown,
  ineligibleBv,
}: {
  stageBreakdown: Record<PayStage, { count: number; bv: number }>;
  ineligibleBv: number;
}) {
  const stages = STAGE_ORDER.filter((s) => s.key !== "Ineligible");
  const stageBv = stages.map((s) => ({ ...s, bv: stageBreakdown[s.key]?.bv || 0 }));
  const total = stageBv.reduce((sum, x) => sum + x.bv, 0);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          color: "var(--green-100)",
          marginBottom: 10,
          fontFamily: "var(--font-editorial)",
          fontStyle: "italic",
        }}
      >
        Total eligible: {fmtEurShort(total)} · Ineligible excluded: {fmtEurShort(ineligibleBv)}
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          borderRadius: 6,
          overflow: "hidden",
          height: 28,
          marginBottom: 12,
        }}
      >
        {stageBv.map((s, i) => {
          if (s.bv <= 0) return null;
          const p = (s.bv / total) * 100;
          return (
            <PipeSeg
              key={s.key}
              flex={s.bv}
              color={s.color}
              label={p >= 4 ? `${s.short} ${p.toFixed(1)}%` : null}
              title={`${s.key}: ${fmtEurShort(s.bv)} (${p.toFixed(1)}%)`}
              delay={120 + i * 70}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {stageBv.map(
          (s) =>
            s.bv > 0 && (
              <span key={s.key} style={{ fontSize: 11, color: "var(--moss)" }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: s.color,
                    borderRadius: 2,
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                />
                {s.key}: {fmtEurShort(s.bv)} ({((s.bv / total) * 100).toFixed(1)}%)
              </span>
            )
        )}
      </div>
    </div>
  );
}

function PipeSeg({
  flex,
  color,
  label,
  title,
  delay = 0,
}: {
  flex: number;
  color: string;
  label: string | null;
  title: string;
  delay?: number;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(flex), 30 + delay);
    return () => clearTimeout(t);
  }, [flex, delay]);
  return (
    <div
      title={title}
      style={{
        flex: w,
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "flex-grow 700ms var(--ease-out)",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {label && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-on-moss)",
            whiteSpace: "nowrap",
            padding: "0 4px",
            opacity: w > 0 ? 1 : 0,
            transition: "opacity 320ms ease 320ms",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/* ---------------- owner card ---------------- */

function OwnerCard({
  name,
  stats,
}: {
  name: string;
  stats: {
    totalBv: number;
    eligBv: number;
    pctLc: number;
    pctAcv: number;
    stageCounts: Record<PayStage, { count: number; bv: number }>;
  };
}) {
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <h3
        style={{
          margin: "0 0 6px",
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--moss)",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {name}
      </h3>
      <div style={{ fontSize: 11, color: "var(--green-100)", marginBottom: 10 }}>
        Total BV: {fmtEurShort(stats.totalBv)} · Eligible: {fmtEurShort(stats.eligBv)}
      </div>
      <AnimBar pct={Math.min(stats.pctLc, 100)} color="#2F5F3D" height={6} radius={3} bg="var(--hairline)" delay={120} />
      <div style={{ height: 8 }} />
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--pay-stage-live)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <CountUpPct value={stats.pctLc} />
      </div>
      <div style={{ fontSize: 11, color: "var(--green-100)", marginBottom: 12 }}>BV live/verified</div>
      <div>
        {STAGE_ORDER.map((s) => {
          const bv = stats.stageCounts[s.key]?.bv || 0;
          if (bv <= 0) return null;
          const denom = s.key === "Ineligible" ? stats.totalBv : stats.eligBv;
          const p = denom > 0 ? (bv / denom) * 100 : 0;
          return (
            <div
              key={s.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 0",
                fontSize: 12,
                color: "var(--moss)",
              }}
            >
              <span>
                <StageDot stage={s.key} />
                {s.key}
                {s.key === "Ineligible" ? " (excl.)" : ""}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {p.toFixed(1)}% · {fmtEurShort(bv)}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--green-100)",
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        ARR live/verified: {stats.pctAcv.toFixed(1)}%
      </div>
    </div>
  );
}

/* ---------------- path to target ---------------- */

function PathCard({
  name,
  owner,
  targetPct,
  allEligBv,
  onDealClick,
  mode = "path",
}: {
  name: string;
  owner: PayOwnerSummary;
  targetPct: number;
  allEligBv: number;
  onDealClick: (deal: PayDeal) => void;
  // "live" — show every Verified/Live deal for this owner.
  // "path" — show only the pipeline deals needed to reach the target,
  //          starting Run % from the existing Verified/Live baseline.
  mode?: "live" | "path";
}) {
  const live = owner.deals.filter((d) => LIVE_STAGES.includes(d.stage)).sort((a, b) => b.bv - a.bv);
  const pipe = owner.deals
    .filter((d) => !LIVE_STAGES.includes(d.stage) && d.stage !== "Ineligible" && d.stage !== "Unwilling")
    .sort((a, b) => b.bv - a.bv);
  const liveBv = live.reduce((sum, d) => sum + d.bv, 0);

  type Row =
    | { kind: "sep" }
    | { kind: "row"; deal: PayDeal; runPct: number; pp: number; isLive: boolean; highlight: boolean; n: number };

  const rows: Row[] = [];
  if (mode === "live") {
    let running = 0;
    for (const d of live) {
      running += d.bv;
      const runPct = owner.eligibleBv > 0 ? (running / owner.eligibleBv) * 100 : 0;
      const pp = owner.eligibleBv > 0 ? (d.bv / owner.eligibleBv) * 100 : 0;
      const n = rows.filter((r) => r.kind === "row").length + 1;
      rows.push({ kind: "row", deal: d, runPct, pp, isLive: true, highlight: false, n });
    }
  } else {
    // Pipeline only: baseline running total at the live BV so Run %
    // reflects "where we land if these migrations happen on top of
    // what's already verified/live".
    let running = liveBv;
    let pastTarget = owner.eligibleBv > 0
      ? (liveBv / owner.eligibleBv) * 100 >= targetPct
      : false;
    for (const d of pipe) {
      running += d.bv;
      const runPct = owner.eligibleBv > 0 ? (running / owner.eligibleBv) * 100 : 0;
      const pp = owner.eligibleBv > 0 ? (d.bv / owner.eligibleBv) * 100 : 0;
      let highlight = false;
      if (!pastTarget && runPct >= targetPct) {
        pastTarget = true;
        highlight = true;
      }
      const n = rows.filter((r) => r.kind === "row").length + 1;
      rows.push({ kind: "row", deal: d, runPct, pp, isLive: false, highlight, n });
    }
  }

  const cap = mode === "live" ? 10 : 20;
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, cap);
  const hiddenCount = Math.max(0, rows.length - cap);

  const fill = Math.min((owner.lcPercent / (targetPct + 10)) * 100, 100);
  const marker = Math.min((targetPct / (targetPct + 10)) * 100, 100);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <h3
        style={{
          margin: "0 0 10px",
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--moss)",
          textTransform: "uppercase",
        }}
      >
        {name}
      </h3>

      {mode === "path" && (
        <>
          <div
            style={{
              position: "relative",
              height: 7,
              background: "var(--hairline)",
              borderRadius: 4,
              marginBottom: 6,
            }}
          >
            <div style={{ position: "absolute", height: "100%", width: "100%", borderRadius: 4, overflow: "hidden" }}>
              <AnimBar pct={fill} color="var(--moss)" height={7} radius={4} bg="transparent" delay={180} />
            </div>
            <div
              style={{
                position: "absolute",
                top: -4,
                left: `${marker}%`,
                width: 2,
                height: 15,
                background: "var(--status-warn-fg)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 12 }}>
            <span style={{ color: "var(--moss)", fontWeight: 600 }}>
              <CountUpPct value={owner.lcPercent} /> current
            </span>
            <span style={{ color: "var(--status-warn-fg)", fontWeight: 600 }}>{targetPct}% target</span>
          </div>
        </>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Customer</Th>
            <Th>Stage</Th>
            <Th align="right" tip="Booking Volume of this customer's deal, with its share of the org-wide eligible BV in parentheses.">BV (% of {fmtEurShort(allEligBv)})</Th>
            <Th align="right" tip="Percentage points this deal would add to the org's BV-live-on-Pay metric if migrated.">+PP</Th>
            <Th align="right" tip="Running total of org-wide BV-live-on-Pay if every row above this one were migrated.">Run %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--green-100)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-editorial)",
                }}
              >
                No deals to show
              </td>
            </tr>
          ) : (
            visibleRows.map((r, i) => {
              if (r.kind === "sep") {
                return (
                  <tr key={`sep-${i}`}>
                    <td
                      colSpan={6}
                      style={{
                        fontSize: 10.5,
                        color: "var(--green-100)",
                        padding: "6px 4px",
                        background: "var(--beige-new)",
                        fontWeight: 600,
                      }}
                    >
                      ▼ Pipeline needed to reach {targetPct}%
                    </td>
                  </tr>
                );
              }
              const { deal, runPct, pp, isLive, highlight, n } = r;
              // Highlighted (warn) rows use a stronger tonal warn background +
              // a 1px hairline-style left border. The 3px side-stripe is
              // reserved for the focused list row affordance per DESIGN.md §6.
              const bg = isLive
                ? "rgba(26,122,74,0.06)"
                : highlight
                  ? "rgba(193,110,42,0.14)"
                  : "transparent";
              return (
                <tr
                  key={deal.dealId}
                  style={{
                    background: bg,
                    cursor: "pointer",
                  }}
                  onClick={() => onDealClick(deal)}
                >
                  <Td muted>{n}</Td>
                  <Td>
                    <strong style={{ color: "var(--moss)" }}>{deal.dealName}</strong>
                    <FlagsFor deal={deal} />
                  </Td>
                  <Td>
                    <StageLabel stage={deal.stage} />
                  </Td>
                  <Td align="right">{bvWithPct(deal.bv, allEligBv)}</Td>
                  <Td align="right" muted>
                    +{pp.toFixed(1)}pp
                  </Td>
                  <Td align="right" bold>
                    {runPct.toFixed(1)}%
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <ShowAllButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onToggle={() => setExpanded((v) => !v)}
        />
      )}
    </div>
  );
}

function ShowAllButton({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--hairline)",
        background: "var(--card-bg)",
        color: "var(--moss)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {expanded ? "Show less" : `Show all (+${hiddenCount} more)`}
    </button>
  );
}

/* ---------------- unwilling ---------------- */

function UnwillingTable({
  deals,
  allEligBv,
  onDealClick,
}: {
  deals: PayDeal[];
  allEligBv: number;
  onDealClick: (deal: PayDeal) => void;
}) {
  const sorted = [...deals].sort((a, b) => b.bv - a.bv);
  const total = sorted.reduce((s, d) => s + d.bv, 0);
  const pctOfElig = allEligBv > 0 ? (total / allEligBv) * 100 : 0;
  const cap = 10;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sorted : sorted.slice(0, cap);
  const hiddenCount = Math.max(0, sorted.length - cap);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: 18,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          display: "inline-block",
          background: "var(--status-warn-fg)",
          color: "var(--text-on-moss)",
          borderRadius: 6,
          padding: "4px 12px",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 12,
          letterSpacing: "0.04em",
        }}
      >
        {sorted.length} customers, {fmtEurShort(total)} ({pctOfElig.toFixed(1)}% of eligible BV)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Owner</Th>
            <Th>Reason</Th>
            <Th align="right">BV</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--green-100)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-editorial)",
                }}
              >
                None
              </td>
            </tr>
          ) : (
            visible.map((d) => (
              <tr key={d.dealId} style={{ cursor: "pointer" }} onClick={() => onDealClick(d)}>
                <Td>
                  <strong style={{ color: "var(--moss)" }}>{d.dealName}</strong>
                </Td>
                <Td muted>{d.ownerName}</Td>
                <Td>
                  <span style={{ fontSize: 12, color: "var(--moss)" }}>{d.unwillingReason || "No reason given"}</span>
                </Td>
                <Td align="right">{bvWithPct(d.bv, allEligBv)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <ShowAllButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onToggle={() => setExpanded((v) => !v)}
        />
      )}
    </div>
  );
}

/* ---------------- not yet enrolled ---------------- */

function NotEnrolledCard({
  name,
  deals,
  allEligBv,
  onDealClick,
}: {
  name: string;
  deals: PayDeal[];
  allEligBv: number;
  onDealClick: (deal: PayDeal) => void;
}) {
  const totalBv = deals.reduce((s, d) => s + d.bv, 0);
  const pctOfElig = allEligBv > 0 ? (totalBv / allEligBv) * 100 : 0;

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <h3
        style={{
          margin: "0 0 12px",
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--moss)",
          textTransform: "uppercase",
        }}
      >
        {name}{" "}
        <span style={{ fontWeight: 400, color: "var(--green-100)", textTransform: "none" }}>
          ({deals.length} not enrolled · {fmtEurShort(totalBv)} · {pctOfElig.toFixed(1)}%)
        </span>
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Customer</Th>
            <Th>Last activity</Th>
            <Th align="right">BV</Th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--green-100)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-editorial)",
                }}
              >
                None
              </td>
            </tr>
          ) : (
            deals.slice(0, 20).map((d, i) => {
              const days = d.daysSinceActivity;
              let act: React.ReactNode = <span style={{ color: "var(--beige-gray)" }}>n/a</span>;
              if (days != null) {
                let color = "var(--moss)";
                if (days > 90) color = "var(--status-error-fg)";
                else if (days > 30) color = "var(--status-warn-fg)";
                act = (
                  <span style={{ color, fontWeight: days > 30 ? 600 : 400 }}>
                    {days}d ago
                  </span>
                );
              }
              return (
                <tr key={d.dealId} style={{ cursor: "pointer" }} onClick={() => onDealClick(d)}>
                  <Td muted>{i + 1}</Td>
                  <Td>
                    <strong style={{ color: "var(--moss)" }}>{d.dealName}</strong>
                    <FlagsFor deal={d} />
                  </Td>
                  <Td>{act}</Td>
                  <Td align="right">{bvWithPct(d.bv, allEligBv)}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- table primitives ---------------- */

function Th({
  children,
  align,
  tip,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  tip?: string;
}) {
  return (
    <th
      title={tip}
      style={{
        padding: "5px 7px",
        textAlign: align || "left",
        fontFamily: "var(--font-display)",
        fontSize: 9.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--green-100)",
        borderBottom: "1px solid var(--hairline)",
        cursor: tip ? "help" : "default",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  muted,
  bold,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        padding: "5px 7px",
        textAlign: align || "left",
        fontSize: 12,
        color: muted ? "var(--green-100)" : "var(--moss)",
        fontWeight: bold ? 600 : 400,
        borderBottom: "1px solid var(--hairline)",
        fontVariantNumeric: align === "right" ? "tabular-nums" : "normal",
      }}
    >
      {children}
    </td>
  );
}

// re-export for the search-result mapping done in the parent
export type { CompanySearchResult };
