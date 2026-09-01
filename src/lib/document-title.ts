// Browser tab title.
//
// Cmd- / middle-clicking a company opens another dashboard tab (see
// company-link.ts), so several are usually open at once and a single static
// "Customer Dashboard" in every one of them tells the user nothing. An open
// company names its own tab; otherwise the tab names the view it is showing.

/** Static fallback, and the value in layout.tsx's metadata. */
export const APP_TITLE = "Customer Dashboard";

const MAX_LENGTH = 70;

export function documentTitle(opts: {
  /** Open company's name. Null while the detail is still loading, or when no
   *  detail is open — the view title stands in until the name arrives. */
  companyName?: string | null;
  /** Dashboard label, from DASHBOARDS in VariantPicker.tsx. */
  dashboardLabel?: string | null;
  /** Subview qualifier, e.g. Portfolio's "Table" / "Board". */
  subview?: string | null;
}): string {
  const company = opts.companyName?.trim();
  if (company) return clamp(company);

  // No label means the dashboard registry had no entry for the current key.
  // The subview is dropped along with it: "Customer Dashboard - Board" reads
  // like a bug, and the generic title alone is the honest fallback.
  const label = opts.dashboardLabel?.trim();
  if (!label) return APP_TITLE;

  const subview = opts.subview?.trim();
  return clamp(subview ? `${label} - ${subview}` : label);
}

function clamp(s: string): string {
  // A HubSpot company name can be arbitrarily long; a tab shows ~20 chars
  // anyway, and an unbounded title is just wasted history state.
  return s.length > MAX_LENGTH ? `${s.slice(0, MAX_LENGTH - 1).trimEnd()}…` : s;
}
