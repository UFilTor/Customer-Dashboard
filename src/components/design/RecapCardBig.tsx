"use client";

import type { Recap } from "@/lib/types";
import { Icon } from "./Icon";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";

interface RecapCardBigProps {
  recap: Recap | null;
  loading?: boolean;
  companyId: string;
  /** Deal id for the lifecycle/retention deal. When present we deep-link
   *  the suggested-action button into HubSpot's `?interaction=` flow on
   *  the deal record (matches the top-bar CTAs). */
  dealId?: string | null;
  companyName?: string;
  onAction?: (type: string) => void;
}

function actionIcon(type: string | undefined) {
  switch (type) {
    case "call": return <Icon.Phone />;
    case "meeting": return <Icon.Calendar />;
    case "note": return <Icon.Note />;
    case "task": return <Icon.Check />;
    default: return <Icon.Mail />;
  }
}

function actionLabel(type: string | undefined): string {
  switch (type) {
    case "call": return "Make call";
    case "meeting": return "Schedule meeting";
    case "note": return "Log note";
    case "task": return "Create task";
    default: return "Send email";
  }
}

const INTERACTION_BY_TYPE: Record<string, string> = {
  call: "call",
  meeting: "schedule",
  task: "task",
  note: "note",
};

function deepLink(type: string | undefined, companyId: string, dealId?: string | null): string {
  const interaction = type ? INTERACTION_BY_TYPE[type] : undefined;
  if (interaction && dealId) {
    const base = hubspotDealUrl(dealId);
    if (base) return `${base}&interaction=${interaction}`;
  }
  return hubspotCompanyUrl(companyId) ?? "#";
}

export function RecapCardBig({ recap, loading, companyId, dealId }: RecapCardBigProps) {
  const summary = recap?.summary;
  const action = recap?.suggestedAction;

  return (
    <div
      className="animate-fadeIn"
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: 22,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--green-100)",
          }}
        >
          Recap
        </span>
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--beige-gray)" }} />
        <span
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontStyle: "italic",
            fontFamily: "var(--font-editorial)",
          }}
        >
          AI summary
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 16,
          lineHeight: 1.55,
          color: "var(--dark-moss)",
          letterSpacing: "-0.01em",
          fontFamily: "var(--font-editorial)",
          fontWeight: 400,
        }}
      >
        {summary || (
          <span style={{ color: "var(--green-100)", fontStyle: "italic" }}>
            {loading
              ? "Summarising recent activity…"
              : "No recap yet. Activity is being summarised…"}
          </span>
        )}
      </p>

      {action?.text && action.confidence !== "low" && (
        <>
          <div style={{ height: 1, background: "var(--hairline)", margin: "18px 0 16px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, flex: 1, color: "var(--moss)" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--green-100)",
                  marginRight: 8,
                }}
              >
                Suggested
              </span>
              {action.text}
            </p>
            <a
              href={deepLink(action.type, companyId, dealId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "var(--citrus)",
                color: "var(--moss)",
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                transition: "background 160ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--lichen)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--citrus)"; }}
            >
              {actionIcon(action.type)}
              {actionLabel(action.type)}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
