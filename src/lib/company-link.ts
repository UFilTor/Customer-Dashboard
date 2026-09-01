// Deep links to a company detail, for "open in a new tab".
//
// The URL contract already supports this: page-client's writeUrlState puts the
// open company in `c`, and readUrlState restores it on a cold load. So a new
// tab needs nothing but the current URL with `c` set.
//
// Reading window.location.search (rather than re-serializing the UrlState that
// page-client holds) is deliberate: the sync effect keeps the address bar
// canonical, so this can never drift from it, and a leaf row can build its own
// href without every view prop-drilling a serializer down to it.

const NEW_TAB_FEATURES = "noopener,noreferrer";

/** Minimal shape of the mouse events we branch on. */
export interface NewTabClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * The current URL with `c=<companyId>` set, preserving every other view param
 * (`d` dashboard, `f`/`fv` filter, `pv` table/board, `q` search) so closing the
 * detail in the new tab lands on the same list the user came from.
 */
export function companyHref(companyId: string): string {
  if (typeof window === "undefined") return `?c=${encodeURIComponent(companyId)}`;
  const sp = new URLSearchParams(window.location.search);
  // set, not append: the source tab may already have a company open.
  sp.set("c", companyId);
  return `${window.location.pathname}?${sp.toString()}`;
}

/**
 * True for the two gestures that mean "open elsewhere": middle click and
 * Cmd/Ctrl click. shiftKey is deliberately excluded — rows have no shift
 * behavior, and shift-click conventionally opens a new window, which is the
 * browser's call to make, not ours.
 */
export function isNewTabClick(e: NewTabClickLike): boolean {
  return e.button === 1 || e.metaKey || e.ctrlKey;
}

export function openCompanyInNewTab(companyId: string): void {
  if (typeof window === "undefined") return;
  window.open(companyHref(companyId), "_blank", NEW_TAB_FEATURES);
}
