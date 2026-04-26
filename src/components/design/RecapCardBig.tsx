"use client";

import type { Recap } from "@/lib/types";
import { Icon } from "./Icon";

interface RecapCardBigProps {
  recap: Recap | null;
  companyId: string;
  companyName?: string;
  onAction?: (type: string) => void;
}

const HUBSPOT_PORTAL = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

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
    case "call": return "Log call";
    case "meeting": return "Schedule";
    case "note": return "Log note";
    case "task": return "Add task";
    default: return "Send email";
  }
}

function deepLink(type: string | undefined, companyId: string): string {
  // Best-effort: open the company record in HubSpot. The record page lets the user
  // create the right engagement type from there.
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-2/${companyId}`;
}

export function RecapCardBig({ recap, companyId }: RecapCardBigProps) {
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
            No recap yet. Activity is being summarised…
          </span>
        )}
      </p>

      {action?.text && (
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
              href={deepLink(action.type, companyId)}
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
                transition: "all 160ms ease",
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
