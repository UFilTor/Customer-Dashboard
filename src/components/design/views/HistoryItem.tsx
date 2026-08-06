"use client";

// HistoryItem timeline entry + email/Gong parsing helpers.
// Extracted from the retired OnboardingView; used by MeetingPrepBrief.

import type { ReactNode } from "react";
import type { OnboardingHistoryEntry } from "@/lib/types";
import { hubspotEngagementUrl } from "@/lib/hubspot-links";

function Eyebrow({ children }: { children: ReactNode }) {
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
  if (kind === "note") return "Note";
  return "Email";
}

function kindStyles(kind: OnboardingHistoryEntry["kind"]): { bg: string; fg: string } {
  if (kind === "meeting") return { bg: "var(--event-meeting-bg)", fg: "var(--event-meeting-fg)" };
  if (kind === "call") return { bg: "var(--event-call-bg)", fg: "var(--event-call-fg)" };
  if (kind === "note") return { bg: "var(--event-note-bg)", fg: "var(--event-note-fg)" };
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
  const isNote = entry.kind === "note";
  const body = stripMeetingBody(entry.body);
  const gong = !isEmailThread && !isNote ? parseGong(body) : null;
  const kStyles = kindStyles(entry.kind);
  const noteUrl = isNote ? hubspotEngagementUrl("note", entry.id) : null;
  const noteSummary = isNote ? (entry.summary ?? "").trim() : "";

  // Default-collapsed teaser pulls Gong's "Next steps" because they're the most
  // actionable thing for prepping the next conversation.
  const teaserSteps = gong?.steps.slice(0, 3) ?? [];
  const remainingSteps = gong ? Math.max(0, gong.steps.length - teaserSteps.length) : 0;

  // Fallback excerpt for non-Gong meetings (or Gong with no Next steps section).
  // Notes prefer their AI summary; the raw body is behind "Read more".
  const fallback = (() => {
    if (noteSummary) return noteSummary;
    if (gong?.brief) return gong.brief;
    if (body) return body;
    return "";
  })();
  // Never truncate an AI note summary — it's already compressed.
  const fallbackExcerpt =
    isNote && noteSummary
      ? noteSummary
      : fallback.length > 220
        ? fallback.slice(0, 220).trim() + "…"
        : fallback;

  const threadMessages = entry.thread ?? [];
  const hasExpandable =
    isEmailThread
      ? threadMessages.length > 1 || (threadMessages[0]?.body?.length ?? 0) > 200
      : isNote
        ? // Full note behind "Read more" whenever the teaser doesn't already show it all.
          (noteSummary.length > 0 && body.length > 0) || body.length > 220
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
        // Don't animate `padding` — that's a layout property and triggers
        // reflow. Background + box-shadow are paint-only; the small padding
        // bump on focus is fine to snap.
        transition: "background 0.12s, box-shadow 0.12s",
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
        {noteUrl && (
          <a
            href={noteUrl}
            target="_blank"
            rel="noreferrer"
            title="Open note in HubSpot"
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
              textDecorationLine: "none",
              whiteSpace: "nowrap",
            }}
          >
            HubSpot ↗
          </a>
        )}
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

      {isNote && expanded && body && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
          }}
        >
          <Eyebrow>Full note</Eyebrow>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: "var(--dark-moss)",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </p>
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
