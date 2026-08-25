"use client";

// The contact-facing half of the quick-action cluster: call, email, WhatsApp,
// schedule meeting, create task - in that order, which is how CS reaches for
// them (direct contact first, CRM admin last).
//
// Shared so Portfolio rows, kanban cards and the Meeting Prep brief cannot
// drift into different orders or different labels for the same five actions.
// Surface-specific controls stay with the surface: Portfolio adds "Open in
// HubSpot" + snooze after this cluster (cells.tsx), Meeting Prep already has
// its own HubSpot button in the header.
//
// Every button is glyph-only, so the hover/focus label IS the affordance -
// see Tooltip.tsx on why these carry a real tooltip instead of `title`.

import { useState } from "react";
import { hubspotDealUrl } from "@/lib/hubspot-links";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { WhatsAppAction } from "./WhatsAppAction";
import { quickActionBtn } from "./views/portfolio/chrome";

export interface ContactActionsProps {
  /** Backing deal - the HubSpot `?interaction=` flows are deal-scoped. */
  dealId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Company country (ISO-2), needed to dial a nationally formatted number. */
  country: string | null;
  /**
   * Glyph side in px. Defaults to the 13 that suits the 27px row buttons; the
   * company detail header runs a larger --qa-size and asks for more.
   */
  glyphSize?: number;
}

// Clipboard copy with a citrus background flash as confirmation. Icon.Check
// is already the glyph for the "Create task" action on this same row, so an
// icon swap would put two identical checkmarks side by side for 1.5s - the
// background flash confirms without that collision and keeps the button's
// footprint fixed so the row never reflows. Mailto fallback if the clipboard
// API is unavailable.
function CopyEmailButton({
  email,
  contactName,
  glyphSize,
}: {
  email: string | null;
  contactName: string | null;
  glyphSize: number;
}) {
  const [copied, setCopied] = useState(false);
  if (!email) return null;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };
  const label = copied
    ? `Copied ${email}`
    : contactName
      ? `Copy email for ${contactName}`
      : `Copy ${email}`;
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onCopy}
        aria-label={label}
        style={{ ...quickActionBtn, background: copied ? "var(--citrus)" : "var(--card-bg)" }}
      >
        <Icon.Mail size={glyphSize} />
      </button>
    </Tooltip>
  );
}

// One HubSpot `?interaction=` deep-link button.
function DealActionButton({
  dealId,
  interaction,
  label,
  children,
}: {
  dealId: string;
  interaction: "task" | "schedule" | "call";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <a
        href={`${hubspotDealUrl(dealId) ?? "#"}&interaction=${interaction}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        style={quickActionBtn}
      >
        {children}
      </a>
    </Tooltip>
  );
}

export function ContactActions({
  dealId,
  contactName,
  contactEmail,
  contactPhone,
  country,
  glyphSize = 13,
}: ContactActionsProps) {
  // Read defensively: the edge CDN can serve a pre-deploy payload for up to
  // 14 min after a release (AGENTS.md "Caching"), so a row arriving without
  // contact fields must degrade to "no WhatsApp button, unnamed labels"
  // rather than render "undefined".
  const name = contactName ?? null;

  return (
    <>
      {dealId && (
        <DealActionButton
          dealId={dealId}
          interaction="call"
          label={name ? `Call ${name}` : "Log a call in HubSpot"}
        >
          <Icon.Phone size={glyphSize} />
        </DealActionButton>
      )}
      <CopyEmailButton email={contactEmail ?? null} contactName={name} glyphSize={glyphSize} />
      <WhatsAppAction
        phone={contactPhone ?? null}
        country={country ?? null}
        contactName={name}
        style={quickActionBtn}
      >
        <Icon.WhatsApp size={glyphSize} />
      </WhatsAppAction>
      {dealId && (
        <>
          <DealActionButton dealId={dealId} interaction="schedule" label="Schedule meeting">
            <Icon.Calendar size={glyphSize} />
          </DealActionButton>
          <DealActionButton dealId={dealId} interaction="task" label="Create task">
            <Icon.Check size={glyphSize} />
          </DealActionButton>
        </>
      )}
    </>
  );
}
