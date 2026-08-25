"use client";

// The WhatsApp quick action, shared by the Portfolio/Meeting Prep row cluster
// (ContactActions) and the company detail header (CompanyDetail) so both reach
// a contact the same way.
//
// Clicking tries the native `whatsapp://` scheme first, which macOS and Windows
// hand straight to the WhatsApp desktop app - no browser tab, no
// api.whatsapp.com redirect page in between. The catch is that an unregistered
// scheme fails silently: no navigation, no error, the click just does nothing.
// So the anchor keeps the plain web URL as its href and we only fall back to it
// when the page still has focus after the handoff window, i.e. when no app took
// over. Anyone without WhatsApp desktop installed gets exactly the old
// behaviour, one redirect page and all.
//
// Focus is the probe rather than `document.visibilityState`, which stays
// "visible" when another app comes forward over the browser window.

import { whatsappAppUrl, whatsappUrl } from "@/lib/phone";
import { Tooltip } from "./Tooltip";

/**
 * How long to give the OS to hand the click to WhatsApp desktop before assuming
 * nothing will. Long enough to cover a cold app launch stealing focus, short
 * enough that the fallback tab still reads as a response to the click.
 */
const APP_HANDOFF_MS = 1200;

export interface WhatsAppActionProps {
  /** Contact phone as stored in HubSpot (mobilephone ?? phone). */
  phone: string | null;
  /** Company country (ISO-2), needed to dial a nationally formatted number. */
  country: string | null;
  contactName: string | null;
  /** Surface's own quick-action button style - the two clusters differ. */
  style: React.CSSProperties;
  /** Glyph on the row clusters, visible text label in the detail header. */
  children: React.ReactNode;
}

export function WhatsAppAction({
  phone,
  country,
  contactName,
  style,
  children,
}: WhatsAppActionProps) {
  const webHref = whatsappUrl(phone, country);
  if (!webHref) return null;
  const appHref = whatsappAppUrl(phone, country);
  const label = contactName
    ? `Send WhatsApp to ${contactName}`
    : "Send WhatsApp to contact";

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Leave modified and non-primary clicks alone so cmd-click, middle-click
    // and "copy link address" keep working on the real https href.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!appHref) return;
    e.preventDefault();
    window.location.href = appHref;
    window.setTimeout(() => {
      if (!document.hasFocus()) return;
      // Opened blind on purpose: `noopener` makes window.open return null even
      // when it succeeds, so a blocked popup and a successful one are
      // indistinguishable here. Reacting to that null by navigating this tab
      // would send the dashboard to WhatsApp on every single click. A browser
      // that does veto the popup leaves the click looking inert, and cmd-click
      // on the same button still opens the web chat.
      window.open(webHref, "_blank", "noopener,noreferrer");
    }, APP_HANDOFF_MS);
  };

  return (
    <Tooltip label={label}>
      <a
        href={webHref}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        style={style}
      >
        {children}
      </a>
    </Tooltip>
  );
}
