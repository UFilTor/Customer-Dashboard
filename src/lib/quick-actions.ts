// "Actionable without writes" helpers — the dashboard can't push to HubSpot,
// but it can build pre-filled `mailto:` and `tel:` URLs and one-line
// summaries for the clipboard so the user reaches the next step in one click
// instead of three. The actual action still happens in their mail client /
// phone / HubSpot — the dashboard just does the context setup.

export interface CompanyActionContext {
  companyName: string;
  domain?: string | null;
  healthScoreLabel?: string | null; // "Weak", "At risk", etc — already humanised
  healthScoreNum?: string | null;
  mrr?: string | null; // already-formatted "€X.Xk"
  payStatus?: string | null;
  primaryContact?: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

// Gmail compose URL with the recipient prefilled — no subject, no body,
// no greeting/sign-off. CS prefers writing the message themselves; the
// dashboard's job is just to skip the "type the email address" step.
// Opens `mail.google.com` so it routes through Workspace's actual sender
// identity (rather than `mailto:` which would launch Apple Mail). Returns
// null if there's no contact email — caller should hide the button.
export function composeEmailUrl(ctx: CompanyActionContext): string | null {
  const email = ctx.primaryContact?.email;
  if (!email) return null;
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email,
  });
  return `https://mail.google.com/mail/u/0/?${params.toString()}`;
}

// `tel:` URL with whitespace stripped (some dialers gag on " 045..."). Null
// if no phone.
export function callUrl(ctx: CompanyActionContext): string | null {
  const phone = ctx.primaryContact?.phone;
  if (!phone) return null;
  return `tel:${phone.replace(/\s+/g, "")}`;
}

// One-line summary suitable for pasting into Slack, an email, or a HubSpot
// note. Skips empty fields rather than emitting "—".
export function companySummaryLine(ctx: CompanyActionContext): string {
  const health = ctx.healthScoreLabel
    ? `health ${ctx.healthScoreLabel}${ctx.healthScoreNum ? ` (${ctx.healthScoreNum})` : ""}`
    : null;
  const parts = [
    ctx.companyName,
    ctx.domain || null,
    ctx.payStatus ? `pay: ${ctx.payStatus}` : null,
    health,
    ctx.mrr || null,
  ].filter(Boolean);
  return parts.join(" · ");
}
