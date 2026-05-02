"use client";

import { useMemo } from "react";
import type {
  OnboardingDeal,
  OnboardingHistoryEntry,
  OnboardingRisk,
} from "@/lib/types";

import { OWNER_MAP } from "@/lib/owners";
import { fmtMrr, relDays } from "@/lib/format-design";
import { CountUpInt, Stagger } from "../Motion";
import { Avatar } from "../Avatar";
import { useListKeyboardNav } from "../useListKeyboardNav";

interface Props {
  deals: OnboardingDeal[];
  filterLabel?: string | null;
  onSelect: (deal: OnboardingDeal) => void;
}

// Tightened "Needs attention" rule per design ask:
// only flag accounts that are genuinely far past their expected window.
const ATTENTION_OVERDUE_THRESHOLD_DAYS = 30;

// Display label for an OnboardingStep — surfaces "In progress" instead of the
// internal "Adopted" value used by the classifier.
const STEP_LABELS: Record<string, string> = {
  Adopted: "In progress",
};

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

export function OnboardingView({ deals, filterLabel, onSelect }: Props) {
  return (
    <AttentionPanel
      deals={deals}
      filterLabel={filterLabel}
      onSelect={onSelect}
    />
  );
}

/* =====================================================
   Needs attention panel
   ===================================================== */

function AttentionPanel({
  deals,
  filterLabel,
  onSelect,
}: {
  deals: OnboardingDeal[];
  filterLabel?: string | null;
  onSelect: (deal: OnboardingDeal) => void;
}) {
  // Per the spec: only show accounts >30 days past their expected step duration.
  const overdue = useMemo(
    () =>
      deals
        .filter((d) => d.daysInStep - d.expectedDaysInStep > ATTENTION_OVERDUE_THRESHOLD_DAYS)
        .sort((a, b) => {
          const overA = a.daysInStep - a.expectedDaysInStep;
          const overB = b.daysInStep - b.expectedDaysInStep;
          return overB - overA;
        }),
    [deals]
  );

  const byStep: Record<string, OnboardingDeal[]> = {};
  for (const d of overdue) {
    const arr = byStep[d.step] || [];
    arr.push(d);
    byStep[d.step] = arr;
  }

  // Flat list across step groups in render order — drives ↑/↓/Enter nav.
  const flatList = useMemo<OnboardingDeal[]>(
    () => Object.values(byStep).flat(),
    // overdue is the source of truth — recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overdue]
  );
  const idxByDealId = useMemo(() => {
    const m = new Map<string, number>();
    flatList.forEach((d, i) => m.set(d.dealId, i));
    return m;
  }, [flatList]);
  const { focusedIdx, containerRef } = useListKeyboardNav<OnboardingDeal>(
    flatList,
    (d) => onSelect(d)
  );

  const totalAcv = overdue.reduce((s, d) => s + d.acv, 0);

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
        padding: "32px 28px 60px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Hero
          eyebrow="Onboarding · Needs attention"
          filterLabel={filterLabel}
          line1Number={overdue.length}
          line1Suffix={`account${overdue.length === 1 ? "" : "s"}`}
          line2={`more than ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days overdue.`}
          body={
            overdue.length === 0 ? (
              <>
                Nothing past the {ATTENTION_OVERDUE_THRESHOLD_DAYS}-day overdue mark right now.
                All onboarding accounts are tracking within their expected windows.
              </>
            ) : (
              <>
                Combined ACV at risk: <strong style={{ color: "var(--citrus)" }}>{fmtMrr(totalAcv)}</strong>.
                Each one has been stuck in their current step for more than{" "}
                {ATTENTION_OVERDUE_THRESHOLD_DAYS} days beyond the expected window. Sorted by how
                far past expected they are.
              </>
            )
          }
        />

        <Stagger
          delay={70}
          initial={120}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}
        >
          <KpiTile
            label="Past 30d overdue"
            value={<CountUpInt value={overdue.length} />}
            sub="needs intervention"
            tone={overdue.length > 0 ? "bad" : undefined}
          />
          <KpiTile
            label="Combined ACV"
            value={<>{fmtMrr(totalAcv)}</>}
            sub="at risk"
          />
          <KpiTile
            label="With blockers"
            value={<CountUpInt value={overdue.filter((d) => d.blockers.length > 0).length} />}
            sub="hibernation / hold"
            tone={overdue.some((d) => d.blockers.length > 0) ? "warn" : undefined}
          />
          <KpiTile
            label="Worst case"
            value={
              overdue.length === 0
                ? <>0d</>
                : <>{overdue[0].daysInStep - overdue[0].expectedDaysInStep}d</>
            }
            sub={overdue.length === 0 ? "" : `${overdue[0].companyName}`}
            tone={overdue.length > 0 ? "bad" : undefined}
          />
        </Stagger>

        {overdue.length === 0 ? (
          <EmptyState
            text={`No onboarding accounts are more than ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days past their expected step duration.`}
          />
        ) : (
          <div ref={containerRef}>
            {Object.entries(byStep).map(([step, list]) => (
              <Section
                key={step}
                title={stepLabel(step)}
                subtitle={`${list.length} account${list.length === 1 ? "" : "s"} stuck > ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days past expected`}
                count={list.length}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                  {list.map((d, i) => {
                    const globalIdx = idxByDealId.get(d.dealId) ?? -1;
                    return (
                      <StuckCard
                        key={d.dealId}
                        deal={d}
                        onClick={() => onSelect(d)}
                        index={i}
                        listIdx={globalIdx}
                        isFocused={globalIdx === focusedIdx}
                      />
                    );
                  })}
                </div>
              </Section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================
   Shared atoms
   ===================================================== */

function Hero({
  eyebrow,
  filterLabel,
  line1Number,
  line1Suffix,
  line2,
  body,
}: {
  eyebrow: string;
  filterLabel?: string | null;
  line1Number: number;
  line1Suffix: string;
  line2: string;
  body: React.ReactNode;
}) {
  // Date depends on the user's local clock. SSR renders an empty string and the
  // client fills it on first paint; suppressHydrationWarning tells React this
  // mismatch is intentional and not a real bug.
  const dateStr = typeof window === "undefined"
    ? ""
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div
      style={{
        background: "var(--moss)",
        color: "var(--text-on-moss)",
        borderRadius: 20,
        padding: "32px 36px",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
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
            {eyebrow}
          </span>
          <span style={{ height: 1, flex: "0 0 32px", background: "rgba(241,249,126,0.4)" }} />
          <span
            suppressHydrationWarning
            style={{
              fontSize: 12,
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
          style={{
            margin: "0 0 18px",
            fontFamily: "var(--font-display)",
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.05,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            color: "var(--text-on-moss)",
          }}
        >
          <span className="citrus-wipe" style={{ color: "var(--moss)" }}>
            <CountUpInt value={line1Number} duration={700} /> {line1Suffix}
          </span>
          <br />
          {line2}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 720,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "var(--font-editorial)",
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 22,
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
              fontSize: 13,
              color: "var(--green-100)",
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
            }}
          >
            {subtitle}
          </span>
        )}
        {count != null && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--green-100)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {count} item{count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: "good" | "warn" | "bad" | "accent";
}) {
  const ink =
    tone === "bad"
      ? "var(--rust)"
      : tone === "warn"
        ? "var(--status-warn-bold)"
        : tone === "good"
          ? "var(--status-good-bold)"
          : tone === "accent"
            ? "var(--text-on-moss)"
            : "var(--moss)";
  const bg = tone === "accent" ? "var(--moss)" : "var(--light-grey)";
  const labelColor = tone === "accent" ? "var(--citrus)" : "var(--green-100)";
  const subColor = tone === "accent" ? "rgba(241,249,126,0.9)" : "var(--green-100)";

  return (
    <div
      style={{
        background: bg,
        border: tone === "accent" ? "none" : "1px solid var(--beige-gray)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 32,
          lineHeight: 1,
          color: ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: subColor,
          marginTop: 6,
          fontStyle: "italic",
          fontFamily: "var(--font-editorial)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function RiskPill({ level, compact }: { level: OnboardingRisk; compact?: boolean }) {
  const map: Record<OnboardingRisk, { label: string; bg: string; fg: string }> = {
    low: { label: "on track", bg: "rgba(14,124,76,0.1)", fg: "var(--status-good-bold)" },
    medium: { label: "watch", bg: "rgba(184,118,31,0.12)", fg: "var(--status-warn-bold)" },
    high: { label: "at risk", bg: "rgba(184,74,45,0.1)", fg: "var(--rust)" },
  };
  const m = map[level];
  return (
    <span
      style={{
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        textTransform: "uppercase",
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 6,
        background: m.bg,
        color: m.fg,
        letterSpacing: "0.06em",
        fontFamily: "var(--font-display)",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        textTransform: "uppercase",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: "var(--green-100)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px dashed var(--beige-gray)",
        borderRadius: 14,
        padding: "32px 20px",
        textAlign: "center",
        fontStyle: "italic",
        fontFamily: "var(--font-editorial)",
        fontSize: 14,
        color: "var(--green-100)",
      }}
    >
      {text}
    </div>
  );
}



function stripMeetingBody(html: string | null | undefined): string {
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

// Cut everything from the signoff / signature / quoted reply onwards so each
// message reads as a clean unit. Multi-language since onboarding emails come
// in EN, SV, NO, DA, DE, FR.
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

interface ParsedEmailThread {
  meta: string;
  latestOccurredAt: string;
  latestDirection: "INBOUND" | "OUTBOUND" | null;
  latestOwnerName: string | null;
  latestBody: string;
  earlier: {
    id: string;
    occurredAt: string;
    direction: "INBOUND" | "OUTBOUND" | null;
    ownerName: string | null;
    body: string;
  }[];
}

function parseEmailThread(thread: { id: string; occurredAt: string; body: string; direction: "INBOUND" | "OUTBOUND" | null; ownerName: string | null }[] | undefined): ParsedEmailThread | null {
  if (!thread || thread.length === 0) return null;
  const sorted = [...thread].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const latest = sorted[sorted.length - 1];
  const earlierAsc = sorted.slice(0, -1);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const startStr = fmtDate(sorted[0].occurredAt);
  const endStr = fmtDate(latest.occurredAt);
  const dateRange = startStr === endStr ? startStr : `${startStr} → ${endStr}`;

  const inbound = sorted.filter((m) => m.direction === "INBOUND").length;
  const outbound = sorted.filter((m) => m.direction === "OUTBOUND").length;
  const ownerName = sorted.find((m) => m.direction === "OUTBOUND" && m.ownerName)?.ownerName
    ?? sorted.find((m) => m.ownerName)?.ownerName
    ?? null;
  let participants = "";
  if (inbound > 0 && outbound > 0) participants = ownerName ? `${ownerName} ↔ customer` : "two-way";
  else if (outbound > 0) participants = ownerName ? `${ownerName} → customer` : "outbound only";
  else if (inbound > 0) participants = "customer inbound";

  const meta = [dateRange, `${sorted.length} message${sorted.length === 1 ? "" : "s"}`, participants]
    .filter(Boolean)
    .join(" · ");

  return {
    meta,
    latestOccurredAt: latest.occurredAt,
    latestDirection: latest.direction,
    latestOwnerName: latest.ownerName,
    latestBody: cleanEmailBody(latest.body),
    earlier: earlierAsc
      .slice()
      .reverse() // most recent of the older ones first
      .map((m) => ({
        id: m.id,
        occurredAt: m.occurredAt,
        direction: m.direction,
        ownerName: m.ownerName,
        body: cleanEmailBody(m.body),
      })),
  };
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
  thread: { id: string; occurredAt: string; body: string; direction: "INBOUND" | "OUTBOUND" | null; ownerName: string | null }[];
}) {
  const parsed = parseEmailThread(thread);
  if (!parsed) return null;
  const latestMetaLine = [
    fmtThreadTime(parsed.latestOccurredAt),
    dirLabel(parsed.latestDirection),
    parsed.latestOwnerName,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {parsed.meta && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {parsed.meta}
        </div>
      )}
      <div>
        <Eyebrow>Latest message</Eyebrow>
        {latestMetaLine && (
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-100)",
              marginTop: 4,
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
          {parsed.latestBody || (
            <span style={{ fontStyle: "italic", color: "var(--green-100)" }}>(empty body)</span>
          )}
        </p>
      </div>
      {parsed.earlier.length > 0 && (
        <div>
          <Eyebrow>Earlier in thread</Eyebrow>
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
            {parsed.earlier.map((m) => {
              const meta = [fmtThreadTime(m.occurredAt), dirLabel(m.direction), m.ownerName]
                .filter(Boolean)
                .join(" · ");
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
                    {m.body || (
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

interface ParsedGong {
  brief: string | null;
  points: { title?: string; body: string }[];
  steps: string[];
}

// Extract Gong's structured sections from a stripped meeting body.
// Returns null when the body isn't Gong-formatted.
function parseGong(body: string): ParsedGong | null {
  if (!body || !/Call highlights by Gong/i.test(body)) return null;

  const brief = body
    .match(/Call brief:\s*([\s\S]+?)(?=Key Discussion Points:|Next steps:|$)/i)?.[1]
    ?.trim() ?? null;

  const pointsBlock = body
    .match(/Key Discussion Points:\s*([\s\S]+?)(?=Next steps:|$)/i)?.[1]
    ?.trim();
  const points: ParsedGong["points"] = [];
  if (pointsBlock) {
    const chunks = pointsBlock.split(/\s+(?=\d+\.\s)/);
    for (const raw of chunks) {
      const cleaned = raw.replace(/^\d+\.\s*/, "").trim();
      if (!cleaned) continue;
      const colonIdx = cleaned.indexOf(":");
      if (colonIdx > 0 && colonIdx < 80) {
        points.push({ title: cleaned.slice(0, colonIdx).trim(), body: cleaned.slice(colonIdx + 1).trim() });
      } else {
        points.push({ body: cleaned });
      }
    }
  }

  const stepsBlock = body.match(/Next steps:\s*([\s\S]+)$/i)?.[1]?.trim();
  const steps = stepsBlock ? stepsBlock.split(/\s*\*\s+/).map((s) => s.trim()).filter(Boolean) : [];

  return { brief, points, steps };
}

function kindLabel(kind: OnboardingHistoryEntry["kind"]): string {
  if (kind === "meeting") return "Meeting";
  if (kind === "call") return "Call";
  return "Email";
}

function kindStyles(kind: OnboardingHistoryEntry["kind"]): { bg: string; fg: string } {
  if (kind === "meeting") return { bg: "var(--event-meeting-bg)", fg: "var(--event-meeting-fg)" };
  if (kind === "call") return { bg: "var(--event-call-bg)", fg: "var(--event-call-fg)" };
  return { bg: "var(--lichen)", fg: "var(--moss)" };
}

export function HistoryItem({
  entry,
  expanded,
  onToggleExpand,
  focused,
}: {
  entry: OnboardingHistoryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  focused?: boolean;
}) {
  const date = new Date(entry.occurredAt);
  const dateStr = isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isEmailThread = entry.kind === "email" && entry.thread && entry.thread.length > 0;
  const body = stripMeetingBody(entry.body);
  const gong = !isEmailThread ? parseGong(body) : null;
  const kStyles = kindStyles(entry.kind);

  // Default-collapsed teaser pulls Gong's "Next steps" because they're the most
  // actionable thing for prepping the next conversation.
  const teaserSteps = gong?.steps.slice(0, 3) ?? [];
  const remainingSteps = gong ? Math.max(0, gong.steps.length - teaserSteps.length) : 0;

  // Fallback excerpt for non-Gong meetings (or Gong with no Next steps section).
  const fallback = (() => {
    if (gong?.brief) return gong.brief;
    if (body) return body;
    return "";
  })();
  const fallbackExcerpt = fallback.length > 220 ? fallback.slice(0, 220).trim() + "…" : fallback;

  const threadMessages = entry.thread ?? [];
  const hasExpandable =
    isEmailThread
      ? threadMessages.length > 1 || (threadMessages[0]?.body?.length ?? 0) > 200
      : gong != null && (gong.points.length > 0 || (gong.brief && gong.brief.length > 0) || gong.steps.length > teaserSteps.length);

  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--dark-moss)",
        paddingLeft: 14,
        paddingRight: focused ? 8 : 0,
        paddingTop: focused ? 6 : 0,
        paddingBottom: focused ? 6 : 0,
        position: "relative",
        background: focused ? "var(--beige-new)" : "transparent",
        borderRadius: focused ? 8 : 0,
        boxShadow: focused ? "inset 3px 0 0 var(--moss)" : "none",
        transition: "background 0.12s, box-shadow 0.12s, padding 0.12s",
      }}
    >
      {/* Timeline bullet — hidden when focused so it doesn't overlap the
          inset focus bar at the same left edge. */}
      {!focused && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--moss)",
            opacity: 0.5,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: kStyles.bg,
            color: kStyles.fg,
            padding: "2px 7px",
            borderRadius: 5,
          }}
        >
          {kindLabel(entry.kind)}
          {entry.kind === "email" && entry.direction === "INBOUND" ? " in" : ""}
          {entry.kind === "email" && entry.direction === "OUTBOUND" ? " out" : ""}
        </span>
        <strong style={{ color: "var(--moss)" }}>{dateStr}</strong>
        <span style={{ color: "var(--green-100)" }}>·</span>
        <span style={{ color: "var(--moss)", flex: 1, minWidth: 0 }}>
          {entry.title}
          {isEmailThread && threadMessages.length > 1 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: "var(--green-100)",
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
              }}
            >
              · {threadMessages.length} messages
            </span>
          )}
        </span>
        {hasExpandable && (
          <button
            onClick={onToggleExpand}
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
            {expanded ? "Hide" : "Read more"}
          </button>
        )}
      </div>

      {teaserSteps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Eyebrow>Action items from this call</Eyebrow>
          <ul
            style={{
              margin: "4px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {teaserSteps.map((s, i) => (
              <li
                key={i}
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "var(--dark-moss)",
                  background: "rgba(241,249,126,0.18)",
                  border: "1px solid rgba(241,249,126,0.5)",
                  borderRadius: 6,
                  padding: "6px 10px",
                }}
              >
                {s}
              </li>
            ))}
          </ul>
          {!expanded && remainingSteps > 0 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--green-100)",
                marginTop: 4,
                fontStyle: "italic",
                fontFamily: "var(--font-editorial)",
              }}
            >
              + {remainingSteps} more action item{remainingSteps === 1 ? "" : "s"} (Read more)
            </div>
          )}
        </div>
      )}

      {teaserSteps.length === 0 && !isEmailThread && fallbackExcerpt && (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {fallbackExcerpt}
        </p>
      )}

      {isEmailThread && !expanded && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {(() => {
            const last = threadMessages[threadMessages.length - 1];
            const cleaned = cleanEmailBody(last.body).replace(/\s+/g, " ").slice(0, 220).trim();
            const prefix =
              last.direction === "INBOUND"
                ? "Latest reply: "
                : last.direction === "OUTBOUND"
                  ? "Latest sent: "
                  : "Latest: ";
            return `${prefix}${cleaned}${cleaned.length === 220 ? "…" : ""}`;
          })()}
        </p>
      )}

      {isEmailThread && expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
          }}
        >
          <EmailThreadCard thread={threadMessages} />
        </div>
      )}

      {expanded && gong && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {gong.brief && (
            <div>
              <Eyebrow>Brief</Eyebrow>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--dark-moss)", lineHeight: 1.55 }}>
                {gong.brief}
              </p>
            </div>
          )}
          {gong.points.length > 0 && (
            <div>
              <Eyebrow>Key discussion points</Eyebrow>
              <ol
                style={{
                  margin: "4px 0 0",
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {gong.points.map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--dark-moss)" }}>
                    {p.title && <strong style={{ color: "var(--moss)" }}>{p.title}: </strong>}
                    {p.body}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {gong.steps.length > teaserSteps.length && (
            <div>
              <Eyebrow>All action items</Eyebrow>
              <ul
                style={{
                  margin: "4px 0 0",
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {gong.steps.slice(teaserSteps.length).map((s, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--dark-moss)",
                      background: "rgba(241,249,126,0.18)",
                      border: "1px solid rgba(241,249,126,0.5)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* =====================================================
   Stuck card (used by AttentionPanel)
   ===================================================== */

function StuckCard({ deal: d, onClick, index = 0, listIdx, isFocused }: { deal: OnboardingDeal; onClick: () => void; index?: number; listIdx?: number; isFocused?: boolean }) {
  const ownerLocal = OWNER_MAP[d.ownerId] || null;
  const overBy = d.daysInStep - d.expectedDaysInStep;
  const delay = 80 + Math.min(index, 10) * 24;
  // Blocker pills: split each blocker on its first ":" so "Hibernation: ..."
  // becomes a {Hibernation} pill with the long-form note moved to title.
  const blockerTags = d.blockers.map((b) => {
    const i = b.indexOf(":");
    if (i === -1) return { label: b, detail: "" };
    return { label: b.slice(0, i).trim(), detail: b.slice(i + 1).trim() };
  });
  return (
    <button
      onClick={onClick}
      data-list-idx={listIdx}
      style={{
        background: isFocused ? "var(--beige-new)" : "var(--light-grey)",
        border: `1px solid ${isFocused ? "var(--moss)" : "var(--beige-gray)"}`,
        boxShadow: isFocused ? "inset 3px 0 0 var(--moss)" : "none",
        borderRadius: 14,
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "1fr 220px 160px 140px",
        gap: 16,
        alignItems: "center",
        textAlign: "left",
        cursor: "pointer",
        animation: `staggerIn 320ms var(--ease-out) ${delay}ms both`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--moss)" }}>{d.companyName}</span>
          <RiskPill level={d.riskLevel} compact />
        </div>
        {blockerTags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
            {blockerTags.map((b, i) => (
              <span
                key={`${b.label}-${i}`}
                title={b.detail || undefined}
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--status-warn-bg)",
                  color: "var(--status-warn-fg)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--green-100)",
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
            }}
          >
            In {stepLabel(d.step)} for {d.daysInStep}d (expected {d.expectedDaysInStep}d)
          </div>
        )}
      </div>
      <div>
        <Eyebrow>Stuck at</Eyebrow>
        <div style={{ fontSize: 13, color: "var(--moss)", fontWeight: 600, marginBottom: 4 }}>{stepLabel(d.step)}</div>
        <PacingBar daysInStep={d.daysInStep} expected={d.expectedDaysInStep} />
      </div>
      <div>
        <Eyebrow>Last touch</Eyebrow>
        <div style={{ fontSize: 13, color: "var(--moss)" }}>{relDays(d.lastTouch)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <Avatar owner={ownerLocal} size={24} />
        <span style={{ fontSize: 12, color: "var(--green-100)" }}>{d.ownerName.split(" ")[0]}</span>
      </div>
    </button>
  );
  // overBy is consumed indirectly via PacingBar's derived ratio; the pill
  // would be redundant alongside the bar, so we omit the standalone "+Xd"
  // line that used to live here.
  void overBy;
}

// Step-pacing bar. Fills cream → moss up to expected, then turns rust beyond.
// 100% bar width = expected; capped at 200% so the eye still gets a useful
// reading on extreme overruns.
function PacingBar({ daysInStep, expected }: { daysInStep: number; expected: number }) {
  if (expected <= 0) return null;
  const pct = Math.min(2, daysInStep / expected);
  const overflow = pct > 1;
  const overBy = daysInStep - expected;
  return (
    <div
      title={`${daysInStep}d in step · expected ${expected}d${overflow ? ` · ${overBy}d over` : ""}`}
      style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}
    >
      <div
        style={{
          width: "100%",
          height: 4,
          background: "var(--hairline)",
          borderRadius: 2,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(100, (pct * 100) / 2)}%`,
            background: overflow ? "var(--rust)" : "var(--moss)",
            borderRadius: 2,
          }}
        />
        {overflow && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: -2,
              bottom: -2,
              width: 1,
              background: "rgba(2,44,18,0.3)",
            }}
          />
        )}
      </div>
      {overflow && (
        <span style={{ fontSize: 10.5, color: "var(--rust)", fontVariantNumeric: "tabular-nums" }}>
          +{overBy}d over expected
        </span>
      )}
    </div>
  );
}
