"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  CompanyDetail as CompanyDetailData,
  CompanySearchResult,
  OwnerMap,
  StageMap,
} from "@/lib/types";
import { TopBar } from "@/components/design/TopBar";
import {
  VariantPicker,
  DASHBOARDS,
  type DashboardKey,
} from "@/components/design/VariantPicker";
import { CommandPalette, type PaletteAction } from "@/components/design/CommandPalette";
import { ViewTransition } from "@/components/design/ViewTransition";
import { CompanyDetail } from "@/components/design/CompanyDetail";
// Heavy dashboard containers — code-split so the default dashboard's first paint
// doesn't pay the cost of PortfolioView + PayMigrationView (1.3k lines).
// They load on first navigation to their respective dashboard.
const PayMigrationContainer = dynamic(
  () =>
    import("@/components/design/views/PayMigrationContainer").then((m) => m.PayMigrationContainer),
  { ssr: false }
);
const PortfolioContainer = dynamic(
  () =>
    import("@/components/design/views/PortfolioContainer").then((m) => m.PortfolioContainer),
  { ssr: false }
);
const MeetingPrepContainer = dynamic(
  () =>
    import("@/components/design/views/MeetingPrepContainer").then((m) => m.MeetingPrepContainer),
  { ssr: false }
);
const SearchContainer = dynamic(
  () =>
    import("@/components/design/views/SearchContainer").then((m) => m.SearchContainer),
  { ssr: false }
);
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";
import { LiveRegion } from "@/components/LiveRegion";
import { EditorialEmpty } from "@/components/design/EditorialEmpty";
import {
  filterLabel as buildFilterLabel,
  parseFilter,
  serializeFilter,
  ALL_FILTER,
  REGIONS,
  scopeHasMixedOwners,
  type RegionKey,
  OWNERS,
  type GlobalFilter,
} from "@/lib/owners";
import { addRecentCompany, computeRevenueFromDetail } from "@/lib/recent-companies";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";

type DetailData = CompanyDetailData & { owners: OwnerMap; stages: StageMap };

// URL ↔ state helpers. Keeping the URL canonical for view state means back /
// forward / refresh / share-link all work. localStorage stays as a fallback
// for the very first visit.
type UrlState = {
  dashboard: DashboardKey;
  filter: GlobalFilter;
  payFilter: "default" | "all";
  portfolioView?: "table" | "board";
  portfolioSearch?: string;
  selectedCompanyId: string | null;
};

function readUrlState(): Partial<UrlState> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const out: Partial<UrlState> = {};
  const d = sp.get("d");
  if (
    d === "meeting_prep" ||
    d === "portfolio" ||
    d === "pay_migration" ||
    d === "search"
  )
    out.dashboard = d;
  const fk = sp.get("f");
  const fv = sp.get("fv");
  if (fk === "region" && REGIONS.some((r) => r.key === fv)) {
    out.filter = { kind: "region", region: fv as RegionKey };
  } else if (fk === "person" && fv) {
    out.filter = { kind: "person", ownerId: fv };
  } else if (fk === "all") {
    out.filter = { kind: "all" };
  }
  const pf = sp.get("pf");
  if (pf === "default" || pf === "all") out.payFilter = pf;
  const pv = sp.get("pv");
  if (pv === "table" || pv === "board") out.portfolioView = pv;
  // Capped because the term goes straight into a substring match over every
  // row on every keystroke, and a hand-crafted link shouldn't be able to hand
  // us a megabyte of it.
  const q = sp.get("q");
  if (q) out.portfolioSearch = q.slice(0, 100);
  const c = sp.get("c");
  if (c) out.selectedCompanyId = c;
  return out;
}

// readUrlState returns only the params that are present. Anything the URL
// omits means "the default", since writeUrlState drops d=portfolio and friends
// on purpose. So anything reading a history entry back (popstate)
// has to resolve a FULL state, never a partial one. Keep these defaults in
// sync with the omission rules in writeUrlState below.
function resolveUrlState(p: Partial<UrlState>): UrlState {
  return {
    dashboard: p.dashboard ?? "portfolio",
    filter: p.filter ?? ALL_FILTER,
    payFilter: p.payFilter ?? "default",
    portfolioView: p.portfolioView ?? "table",
    portfolioSearch: p.portfolioSearch ?? "",
    selectedCompanyId: p.selectedCompanyId ?? null,
  };
}

function sameUrlState(a: UrlState, b: UrlState): boolean {
  return (
    a.dashboard === b.dashboard &&
    serializeFilter(a.filter) === serializeFilter(b.filter) &&
    a.payFilter === b.payFilter &&
    (a.portfolioView ?? "table") === (b.portfolioView ?? "table") &&
    (a.portfolioSearch ?? "") === (b.portfolioSearch ?? "") &&
    a.selectedCompanyId === b.selectedCompanyId
  );
}

// True when the entry behind the current one was pushed by this app, so
// history.back() lands on a dashboard view instead of leaving the site.
function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  return (((window.history.state as { udDepth?: number } | null)?.udDepth) ?? 0) > 0;
}

function writeUrlState(state: UrlState, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams();
  if (state.dashboard !== "portfolio") sp.set("d", state.dashboard);
  if (state.filter.kind !== "all") {
    sp.set("f", state.filter.kind);
    if (state.filter.kind === "region") sp.set("fv", state.filter.region);
    if (state.filter.kind === "person") sp.set("fv", state.filter.ownerId);
  }
  if (state.dashboard === "pay_migration" && state.payFilter !== "default") {
    sp.set("pf", state.payFilter);
  }
  if (state.dashboard === "portfolio" && state.portfolioView && state.portfolioView !== "table") {
    sp.set("pv", state.portfolioView);
  }
  if (state.dashboard === "portfolio" && state.portfolioSearch) {
    sp.set("q", state.portfolioSearch);
  }
  if (state.selectedCompanyId) sp.set("c", state.selectedCompanyId);
  const qs = sp.toString();
  const next = qs ? `?${qs}` : window.location.pathname;
  // Carry the whole existing history state forward and only add our own key.
  // Two reasons:
  //  1. The depth counter lets canGoBackInApp() tell "there is an app entry
  //     behind this one" from "this is where the user landed". Passing null
  //     (as this used to) wipes it, which is what neutered the old
  //     { company: true } marker one line after it got pushed.
  //  2. Next's App Router keeps __NA and __PRIVATE_NEXTJS_INTERNALS_TREE in
  //     history.state, and its popstate handler does a full
  //     window.location.reload() on any entry missing __NA. Its patched
  //     pushState copies those over for us, but only once its own mount effect
  //     has run, and child effects (this one) run first. Copying them
  //     ourselves makes the ordering irrelevant.
  const current = (window.history.state ?? {}) as Record<string, unknown>;
  const depth = typeof current.udDepth === "number" ? current.udDepth : 0;
  const data = { ...current, udDepth: mode === "push" ? depth + 1 : depth };
  if (mode === "push") {
    window.history.pushState(data, "", next);
  } else {
    window.history.replaceState(data, "", next);
  }
}

export default function DashboardClient() {
  // View state — start with hardcoded defaults so server and client first
  // render agree (no hydration mismatch). The `useEffect` below reads URL
  // params and localStorage after mount and applies them, so a deep link
  // like /?d=portfolio lands on Portfolio within a frame of hydration.
  const [dashboard, setDashboard] = useState<DashboardKey>("portfolio");
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>(ALL_FILTER);
  const [defaultFilter, setDefaultFilter] = useState<GlobalFilter | null>(null);
  const [payFilter, setPayFilter] = useState<"default" | "all">("default");
  const [portfolioView, setPortfolioView] = useState<"table" | "board">("table");
  // Portfolio's free-text row filter. Lives up here (not in
  // PortfolioContainer) because opening a company detail unmounts the
  // container - see AGENTS.md "Dashboard container lifecycle". Deliberately
  // NOT mirrored to localStorage the way portfolioView is: a term restored on
  // a fresh visit would silently hide rows with no visible cause.
  const [portfolioSearch, setPortfolioSearch] = useState("");

  // Selection state. This used to be a per-scope map because each Status
  // variant (briefing/split) owned its own slot; with Status gone there is a
  // single selection shared by every dashboard.
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  // Mirror the setter into a ref so the keyboard listener, attached once on
  // mount, always calls the current one.
  const setSelectedCompanyIdRef = useRef(setSelectedCompanyId);
  setSelectedCompanyIdRef.current = setSelectedCompanyId;
  const [companyData, setCompanyData] = useState<DetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Switching dashboards clears any open detail. Without this the previous
  // dashboard's detail panel bleeds into the new dashboard until the user
  // navigates away. "Adjust state during render" pattern keeps the eslint
  // react-hooks/set-state-in-effect rule happy.
  //
  // Exception: the very first dashboard transition can be URL-driven (a deep
  // link like /?d=meeting_prep&c=<id>). The mount-init effect sets dashboard
  // and the selection from URL in the same batch; without this gate, the
  // adjust-during-render block would wipe the just-set selection. The mount-
  // init effect sets `skipNextDashboardWipe = true` whenever it changes the
  // dashboard from URL state, and we consume the flag here.
  const [prevDashboard, setPrevDashboard] = useState(dashboard);
  const [skipNextDashboardWipe, setSkipNextDashboardWipe] = useState(false);
  if (prevDashboard !== dashboard) {
    setPrevDashboard(dashboard);
    if (skipNextDashboardWipe) {
      setSkipNextDashboardWipe(false);
    } else {
      setSelectedCompanyId(null);
      setCompanyData(null);
      setDetailError(null);
    }
  }

  // UI state
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  // Tracks whether any filter pill dropdown is open. Pills broadcast their
  // state via ud-filter-pill-state; we mirror it into a ref so the keyboard
  // handler can short-circuit cleanly without re-attaching on every change.
  const filterPillOpenRef = useRef(false);
  useEffect(() => {
    function onState(e: Event) {
      filterPillOpenRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    window.addEventListener("ud-filter-pill-state", onState);
    return () => window.removeEventListener("ud-filter-pill-state", onState);
  }, []);

  // Same pattern for Portfolio's Signals/Sort popups: when one is open the
  // page-level ↑/↓/Enter list-nav must yield so the popup can move its own
  // internal focus instead.
  const portfolioPopupOpenRef = useRef(false);
  useEffect(() => {
    function onState(e: Event) {
      portfolioPopupOpenRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    window.addEventListener("ud-portfolio-popup-state", onState);
    return () => window.removeEventListener("ud-portfolio-popup-state", onState);
  }, []);

  // Meeting prep focus levels. Drives whether ←/→/↑/↓/Enter route
  // to day-shift, meeting-nav, history-nav, or toggle-expand.
  const meetingFocusedRef = useRef(false);
  const historyFocusedRef = useRef(false);
  useEffect(() => {
    function onMeetingState(e: Event) {
      meetingFocusedRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    function onHistoryState(e: Event) {
      historyFocusedRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    window.addEventListener("ud-meeting-prep-meeting-focused-state", onMeetingState);
    window.addEventListener("ud-meeting-prep-history-focused-state", onHistoryState);
    return () => {
      window.removeEventListener("ud-meeting-prep-meeting-focused-state", onMeetingState);
      window.removeEventListener("ud-meeting-prep-history-focused-state", onHistoryState);
    };
  }, []);


  // On mount, seed state from URL params (highest priority) and localStorage
  // (fallback for first-time visits). Done in an effect — not a lazy useState
  // init — so server/client first render agree and we don't trip React's
  // hydration-mismatch guard. Resolution order: URL → pinned default → last
  // used → defaults.
  const didMountRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    const fromUrl = readUrlState();
    const ls = (k: string): string | null => {
      try { return localStorage.getItem(k); } catch { return null; }
    };

    // Bug: this used to branch on `fromUrl.dashboard !== dashboard`, so a
    // URL that explicitly requested the same value as the initial default
    // ("portfolio") looked identical to "no dashboard in the URL" and fell
    // through to the localStorage override below — the one dashboard whose
    // deep link could never work. An explicit URL param must always win over
    // localStorage; only fall back to localStorage when the URL has none.
    if (fromUrl.dashboard) {
      if (fromUrl.dashboard !== dashboard) {
        setSkipNextDashboardWipe(true);
        setDashboard(fromUrl.dashboard);
      }
    } else {
      const d = ls("ud-v2-dashboard");
      if (
        d === "portfolio" ||
        d === "meeting_prep" ||
        d === "pay_migration" ||
        d === "search"
      ) {
        if (d !== dashboard) setSkipNextDashboardWipe(true);
        setDashboard(d);
      }
    }
    const pinned = parseFilter(ls("ud-v2-filter-default"));
    if (pinned) setDefaultFilter(pinned);
    if (fromUrl.filter) {
      setGlobalFilter(fromUrl.filter);
    } else {
      const last = parseFilter(ls("ud-v2-filter"));
      const initialFilter = pinned ?? last;
      if (initialFilter) setGlobalFilter(initialFilter);
    }
    if (fromUrl.payFilter) {
      setPayFilter(fromUrl.payFilter);
    } else if (ls("ud-v2-pay-filter") === "all") {
      setPayFilter("all");
    }
    if (fromUrl.portfolioView) {
      setPortfolioView(fromUrl.portfolioView);
    } else if (ls("ud-v2-portfolio-view") === "board") {
      setPortfolioView("board");
    }
    if (fromUrl.portfolioSearch) setPortfolioSearch(fromUrl.portfolioSearch);
    if (fromUrl.selectedCompanyId) setSelectedCompanyId(fromUrl.selectedCompanyId);
    // Gate the URL-sync effect below until this seed has landed in state.
    // Both effects run in the same first commit, so without the gate the sync
    // effect would fire once with the pre-seed defaults and then again with the
    // real state, which now reads as a navigation and pushes a bogus entry.
    setHydrated(true);
    // Mount-init effect intentionally runs once. The `dashboard` reference
    // inside is the initial default; we only branch on it to detect "URL
    // wants a different dashboard than the current default".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror state into the URL (canonical) and localStorage (for first-load
  // restoration). Runs after the mount-init effect above, so the first sync
  // writes the seeded state back to the URL in canonical form.
  const lastUrlRef = useRef<UrlState | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const next: UrlState = {
      dashboard,
      filter: globalFilter,
      payFilter,
      portfolioView,
      portfolioSearch,
      selectedCompanyId,
    };
    const prev = lastUrlRef.current;
    lastUrlRef.current = next;
    // Nothing changed: either an unrelated state slot re-ran this effect, or
    // the state just round-tripped through popstate (which seeds lastUrlRef
    // before applying, so back/forward never echoes a duplicate entry into
    // history and forward keeps working).
    if (!prev || !sameUrlState(prev, next)) {
      // Structural navigation earns its own history entry so browser back
      // returns to the previous dashboard / account. Filter, Pay Default/All
      // and table/board replace in place, so a Shift+F filter sweep doesn't
      // bury the back button under six entries.
      const isNav =
        prev !== null &&
        (next.dashboard !== prev.dashboard ||
          next.selectedCompanyId !== prev.selectedCompanyId);
      writeUrlState(next, isNav ? "push" : "replace");
    }
    try {
      localStorage.setItem("ud-v2-dashboard", dashboard);
      localStorage.setItem("ud-v2-filter", serializeFilter(globalFilter));
      localStorage.setItem("ud-v2-pay-filter", payFilter);
      localStorage.setItem("ud-v2-portfolio-view", portfolioView);
    } catch {
      /* ignore */
    }
  }, [hydrated, dashboard, globalFilter, payFilter, portfolioView, portfolioSearch, selectedCompanyId]);

  // Honor browser back/forward. Every slot is applied unconditionally from a
  // RESOLVED state. Applying only the params present in the URL left the old
  // filter / view in place when the user backed into an entry that doesn't
  // carry them (writeUrlState omits defaults).
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  });
  useEffect(() => {
    function onPop() {
      const s = resolveUrlState(readUrlState());
      // Seed the sync effect's snapshot BEFORE applying, so the write it
      // schedules sees no diff and stays out of history.
      lastUrlRef.current = s;
      // The adjust-during-render guard above wipes the selection on any
      // dashboard change, which would clear the very company we're restoring.
      if (s.dashboard !== dashboardRef.current) setSkipNextDashboardWipe(true);
      setDashboard(s.dashboard);
      setGlobalFilter(s.filter);
      setPayFilter(s.payFilter);
      setPortfolioView(s.portfolioView ?? "table");
      setPortfolioSearch(s.portfolioSearch ?? "");
      setSelectedCompanyId(s.selectedCompanyId);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Pin / unpin the current filter as this device's default.
  const setAsDefault = useCallback(() => {
    setDefaultFilter(globalFilter);
    try { localStorage.setItem("ud-v2-filter-default", serializeFilter(globalFilter)); } catch {/* ignore */}
  }, [globalFilter]);
  const clearDefault = useCallback(() => {
    setDefaultFilter(null);
    try { localStorage.removeItem("ud-v2-filter-default"); } catch {/* ignore */}
  }, []);

  // The pin star lights up only when the *current* filter matches the pinned default.
  const isDefault =
    defaultFilter !== null &&
    defaultFilter.kind === globalFilter.kind &&
    (defaultFilter.kind === "all"
      || (defaultFilter.kind === "region" && globalFilter.kind === "region" && defaultFilter.region === globalFilter.region)
      || (defaultFilter.kind === "person" && globalFilter.kind === "person" && defaultFilter.ownerId === globalFilter.ownerId));

  // Fetch company detail when selectedCompanyId changes
  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyData(null);
      return;
    }
    // HubSpot company ids are positive integers. Skip the fetch for anything
    // else (e.g. ?c=foo from a hand-edited URL) so we don't pollute the
    // browser network log with predictable 404s.
    if (!/^\d+$/.test(selectedCompanyId)) {
      setIsLoadingDetail(false);
      setDetailError("Company not found in HubSpot.");
      return;
    }
    let cancelled = false;
    setIsLoadingDetail(true);
    setDetailError(null);
    (async () => {
      try {
        const res = await apiFetch(`/api/companies/${selectedCompanyId}`);
        if (!res.ok) {
          if (!cancelled) {
            setDetailError(
              res.status === 404
                ? "Company not found in HubSpot."
                : friendlyErrorMessage(null, res.status)
            );
          }
          return;
        }
        const data: DetailData = await res.json();
        if (cancelled) return;
        setCompanyData(data);
        addRecentCompany({
          id: selectedCompanyId,
          name: data.company?.name || "Unknown",
          revenue: computeRevenueFromDetail(data.company, data.deal),
          healthScore: data.company?.health_score,
          domain: data.company?.domain,
        });
      } catch (err) {
        if (!cancelled) setDetailError(friendlyErrorMessage(err));
      } finally {
        if (!cancelled) setIsLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  function selectCompany(id: string) {
    if (selectedCompanyId === id) return;
    // No pushState here: the URL-sync effect pushes on every
    // selectedCompanyId change, so doing it here too would double up.
    setSelectedCompanyId(id);
  }

  function back() {
    if (!selectedCompanyId) return;
    // Prefer a real history step so we don't strand a forward entry. Depth 0
    // means the user landed straight on a ?c= link and going back would leave
    // the app, so close by state and let the sync effect push the list.
    if (canGoBackInApp()) {
      window.history.back();
    } else {
      setSelectedCompanyId(null);
    }
  }

  // Human-readable label for the active filter, shown in the dashboard header
  // so a sticky filter never silently hides results.
  const filterLabel = buildFilterLabel(globalFilter);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // Keyboard shortcuts. State is read through a ref so the listener attaches
  // exactly once (no closure-staleness, no attach/detach churn). The listener
  // runs in the capture phase so any noisy bubble-phase shortcuts from other
  // libraries / browser extensions can't swallow keys before us.
  const stateRef = useRef({
    cmdkOpen, showHelp, selectedCompanyId, dashboard,
    filter: globalFilter, portfolioView,
  });
  // Mirror the latest values via an effect (no deps) so the ref update
  // happens after render commits, satisfying react-hooks/refs.
  useEffect(() => {
    stateRef.current = {
      cmdkOpen, showHelp, selectedCompanyId, dashboard,
      filter: globalFilter, portfolioView,
    };
  });

  // "g" prefix: press g, then [s|m|o|p|b|l] to jump dashboards (Gmail-style).
  const goPrefixRef = useRef<number | null>(null);
  const GO_PREFIX_TIMEOUT_MS = 1500;

  // Active detail tab — broadcast by CompanyDetail so the page-level handler
  // can let ↑/↓ scroll the Activity feed instead of cycling the queue.
  const detailTabRef = useRef<"overview" | "activity">("overview");
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<"overview" | "activity">).detail;
      if (detail === "overview" || detail === "activity") detailTabRef.current = detail;
    }
    window.addEventListener("ud-detail-tab-change", onChange);
    return () => window.removeEventListener("ud-detail-tab-change", onChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target?.isContentEditable ?? false);
      const s = stateRef.current;

      // ⌘K / Ctrl+K — works even when typing
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(true);
        return;
      }

      // ⌘S / Ctrl+S, Portfolio: save current filter + signals + sort as
      // the device default. Ride above the inInput / mod-key short-circuits
      // below so the chord works the same as ⌘K does.
      if (
        mod &&
        e.key.toLowerCase() === "s" &&
        s.dashboard === "portfolio" &&
        !s.selectedCompanyId
      ) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-portfolio-save-defaults"));
        showToast("Saved as default");
        return;
      }

      // Esc — help → palette → filter pill → go-prefix → detail back-out
      if (e.key === "Escape") {
        if (s.showHelp) { setShowHelp(false); return; }
        if (s.cmdkOpen) return;
        if (filterPillOpenRef.current) {
          window.dispatchEvent(new Event("ud-filter-close-all"));
          return;
        }
        if (goPrefixRef.current) {
          goPrefixRef.current = null;
          window.dispatchEvent(new Event("ud-dashboard-picker-close"));
          return;
        }
        if (s.selectedCompanyId) {
          if (canGoBackInApp()) window.history.back();
          else setSelectedCompanyIdRef.current(null);
        }
        return;
      }

      if (inInput || s.cmdkOpen || filterPillOpenRef.current) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      // Resolve "g" prefix → dashboard nav. If the prefix is active and the
      // next key matches, jump to the dashboard.
      const goActive =
        goPrefixRef.current != null &&
        Date.now() - goPrefixRef.current < GO_PREFIX_TIMEOUT_MS;
      if (goActive) {
        const k = e.key.toLowerCase();
        goPrefixRef.current = null;
        // Chord letters live on DASHBOARDS itself; hidden dashboards keep
        // their route but lose the chord until they're un-hidden.
        const dash = DASHBOARDS.find((d) => d.chord === k && !d.hidden);
        if (dash) {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-dashboard-picker-close"));
          if (dash.available) {
            setDashboard(dash.key);
          } else {
            showToast(`${dash.label}: coming soon`);
          }
          return;
        }
        // Unknown second key — close the picker and swallow the keystroke.
        // Without the early return, the second key (e.g. r, ?, f, 1, 2) would
        // fall through to refresh / help / filter handlers, which
        // is not what the user expected from the chord.
        e.preventDefault();
        window.dispatchEvent(new Event("ud-dashboard-picker-close"));
        return;
      }

      // Activate "g" prefix → open the picker dropdown so the options are visible
      if (e.key === "g") {
        e.preventDefault();
        goPrefixRef.current = Date.now();
        window.dispatchEvent(new Event("ud-dashboard-picker-open"));
        // Auto-close the dropdown if the prefix expires without a selection
        const expiry = goPrefixRef.current;
        setTimeout(() => {
          if (goPrefixRef.current === expiry) {
            goPrefixRef.current = null;
            window.dispatchEvent(new Event("ud-dashboard-picker-close"));
          }
        }, GO_PREFIX_TIMEOUT_MS + 50);
        return;
      }

      // Pay Migration filter: 1 = Default, 2 = All. Skip when a company
      // detail is open so 1/2 don't shift the (hidden) underlying scope
      // while the user is reading the panel.
      if (s.dashboard === "pay_migration" && !s.selectedCompanyId) {
        if (e.key === "1") {
          e.preventDefault();
          setPayFilter("default");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setPayFilter("all");
          return;
        }
      }

      // Portfolio: 1-8 toggles individual signal filters, 0 clears them all,
      // S cycles the sort order. The container subscribes to these events.
      // Skip when a company detail is open so the row toggles don't shift
      // the (hidden) signal set while the user is reading the panel.
      if (s.dashboard === "portfolio" && !s.selectedCompanyId) {
        if (e.key >= "1" && e.key <= "8") {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("ud-portfolio-signal-toggle", { detail: Number(e.key) - 1 })
          );
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-portfolio-signal-clear"));
          return;
        }
        // `/` opens + focuses the toolbar's search field. Safe to dispatch
        // unconditionally: we're already past the inInput guard, so this
        // cannot fire while the user is typing in the field itself.
        if (e.key === "/") {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-portfolio-search-focus"));
          return;
        }
        // Plain S cycles the sort order; Shift+S opens the sort selector
        // popup (handled by PortfolioView's Toolbar local listener).
        if (e.key.toLowerCase() === "s" && !e.shiftKey) {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-portfolio-sort-cycle"));
          return;
        }
        // Shift+B toggles between Table and Board layout. Skip while a
        // Portfolio toolbar popover (Signals/Sort) is open, same guard as
        // the ↑/↓/Enter list-nav block below via portfolioPopupOpenRef.
        if (e.shiftKey && e.key.toLowerCase() === "b") {
          if (portfolioPopupOpenRef.current) return;
          e.preventDefault();
          setPortfolioView((v) => (v === "board" ? "table" : "board"));
          return;
        }
        // Board mode: Left/Right move focus to the previous/next non-empty
        // column. PortfolioContainer owns the column-jump math and ignores
        // this event entirely while rendering the table, so it is safe to
        // dispatch unconditionally once we know we're in board mode. Same
        // popover guard as above so arrow keys don't fight the open popup.
        if (s.portfolioView === "board" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          if (portfolioPopupOpenRef.current) return;
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("ud-kanban-column-jump", { detail: { dir: e.key === "ArrowLeft" ? -1 : 1 } })
          );
          return;
        }
      }

      // Meeting prep nav — three modes:
      //   1. nothing focused      → ←/→ shifts day, ↑/↓ starts cycling meetings
      //   2. meeting focused      → → enters Previous activity, ← unfocuses,
      //                             ↑/↓ cycles meetings
      //   3. history focused      → ←/→ exits, ↑/↓ cycles history items,
      //                             Enter or Space toggles expand
      const inMeetingPrep =
        s.dashboard === "meeting_prep" && !s.selectedCompanyId;

      if (inMeetingPrep && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? "prev" : "next";
        if (historyFocusedRef.current) {
          if (dir === "prev")
            window.dispatchEvent(new Event("ud-meeting-prep-history-exit"));
          return;
        }
        if (meetingFocusedRef.current) {
          if (dir === "next")
            window.dispatchEvent(new Event("ud-meeting-prep-history-enter"));
          else window.dispatchEvent(new Event("ud-meeting-prep-meeting-unfocus"));
          return;
        }
        window.dispatchEvent(
          new CustomEvent("ud-meeting-prep-day-shift", { detail: dir })
        );
        return;
      }

      if (inMeetingPrep && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? "prev" : "next";
        if (historyFocusedRef.current) {
          window.dispatchEvent(
            new CustomEvent("ud-meeting-prep-history-nav", { detail: dir })
          );
        } else {
          window.dispatchEvent(
            new CustomEvent("ud-meeting-prep-meeting-nav", { detail: dir })
          );
        }
        return;
      }

      if (inMeetingPrep && (e.key === " " || e.code === "Space")) {
        // Always swallow Space in meeting prep so the page doesn't scroll.
        // When a history item is focused, also fire the toggle event.
        e.preventDefault();
        if (historyFocusedRef.current) {
          window.dispatchEvent(new Event("ud-meeting-prep-history-toggle"));
        }
        return;
      }

      if (inMeetingPrep && e.key === "Enter" && historyFocusedRef.current) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-meeting-prep-history-toggle"));
        return;
      }

      // List navigation in full-page views (currently Portfolio only).
      // The active view subscribes to ud-list-nav / ud-list-open
      // and manages its own focused state. When the Portfolio Signals or
      // Sort popup is open, ↑/↓/Enter belong to the popup, not the list.
      const inListView = !s.selectedCompanyId && s.dashboard === "portfolio";
      const portfolioPopupActive =
        s.dashboard === "portfolio" && portfolioPopupOpenRef.current;
      if (inListView && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (portfolioPopupActive) return;
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-list-nav", { detail: e.key === "ArrowUp" ? "prev" : "next" })
        );
        return;
      }
      if (inListView && e.key === "Enter") {
        if (portfolioPopupActive) return;
        // A Tab-focused control owns its Enter press: quick-action buttons/
        // links in Portfolio rows and cards (and the role="button" rows
        // themselves) must activate natively instead of this capture-phase
        // handler preventDefault-ing and opening the arrow-focused row.
        if (target?.closest?.("a, button, [role='button']")) return;
        e.preventDefault();
        window.dispatchEvent(new Event("ud-list-open"));
        return;
      }

      // Up / Down inside the Activity tab → move between engagement entries.
      // Always wins over queue nav so the user never accidentally swaps company.
      if (
        s.selectedCompanyId &&
        detailTabRef.current === "activity" &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-activity-nav", { detail: e.key === "ArrowUp" ? "prev" : "next" })
        );
        return;
      }

      // Space inside the Activity tab → toggle expand on the focused entry.
      if (
        s.selectedCompanyId &&
        detailTabRef.current === "activity" &&
        (e.key === " " || e.code === "Space")
      ) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-activity-expand"));
        return;
      }

      // Left / Right — switch detail tabs when a company is open
      if (s.selectedCompanyId && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-detail-tab", { detail: e.key === "ArrowLeft" ? "prev" : "next" })
        );
        return;
      }

      // F — open the LEFT filter pill (kind picker). Once a kind is chosen,
      // the right pill auto-opens for the value selection.
      // Shift+F — cycle through filter kinds (All → Region → Person → All)
      // without opening the pill, for fast filter sweeps. Skipped on Portfolio,
      // where Shift+F opens the local signals selector instead.
      if (e.key.toLowerCase() === "f") {
        if (e.shiftKey && s.dashboard === "portfolio") return;
        e.preventDefault();
        if (e.shiftKey) {
          const current = s.filter;
          let next: GlobalFilter;
          if (current.kind === "all") {
            next = { kind: "region", region: REGIONS[0].key };
          } else if (current.kind === "region") {
            // Walk the regions in REGIONS order, then hand over to the people.
            const i = REGIONS.findIndex((r) => r.key === current.region);
            next =
              i >= 0 && i < REGIONS.length - 1
                ? { kind: "region", region: REGIONS[i + 1].key }
                : { kind: "person", ownerId: OWNERS[0].id };
          } else {
            // person — cycle through OWNERS, then back to all.
            const idx = OWNERS.findIndex((o) => o.id === current.ownerId);
            const nextIdx = idx + 1;
            next = nextIdx < OWNERS.length
              ? { kind: "person", ownerId: OWNERS[nextIdx].id }
              : ALL_FILTER;
          }
          setGlobalFilter(next);
          showToast(`Filter: ${buildFilterLabel(next) ?? "All"}`);
          return;
        }
        window.dispatchEvent(new Event("ud-filter-open"));
        return;
      }

      // R — refresh the active dashboard's data. Every container subscribes
      // to ud-refresh-dashboard and refetches itself.
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-refresh-dashboard"));
        showToast("Refreshing…");
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showToast]);

  // Refetch on tab refocus — when the user comes back to the tab after >5min,
  // pull fresh data so they don't stare at stale invoices/health scores. The
  // 5-min floor prevents quick alt-tab flips from spamming HubSpot.
  const lastRefreshAtRef = useRef<number>(Date.now());
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      const elapsed = Date.now() - lastRefreshAtRef.current;
      if (elapsed < 5 * 60 * 1000) return;
      lastRefreshAtRef.current = Date.now();
      window.dispatchEvent(new Event("ud-refresh-dashboard"));
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Palette actions
  function handlePaletteAction(action: PaletteAction) {
    switch (action) {
      case "refresh":
        window.dispatchEvent(new Event("ud-refresh-dashboard"));
        showToast("Refreshing…");
        return;
      case "open-company-in-hubspot": {
        const url = hubspotCompanyUrl(selectedCompanyId);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      case "open-deal-in-hubspot": {
        const url = hubspotDealUrl(companyData?.deal?.hs_object_id ?? null);
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          showToast("No deal linked to this company");
        }
        return;
      }
    }
  }

  function handlePaletteCompany(c: CompanySearchResult) {
    selectCompany(c.id);
  }

  const showBack = !!selectedCompanyId;

  // Render the active view body
  let body: React.ReactNode;

  if (selectedCompanyId) {
    // Detail flow: shared across every dashboard.
    const detailNode =
      companyData && !isLoadingDetail ? (
        <CompanyDetail companyId={selectedCompanyId} data={companyData} />
      ) : detailError ? (
        <EditorialEmpty
          tone="error"
          headline="Could not load the company detail."
          caption={detailError}
        />
      ) : (
        <DetailLoading />
      );

    // Meeting prep: keep the underlying view mounted so day strip + meeting
    // focus state survives the round-trip into a company detail. Esc returns
    // the user to the same focused meeting they came from. The detail node
    // renders on top with display: none toggling.
    if (dashboard === "meeting_prep") {
      body = (
        <>
          <div style={{ display: "none" }}>
            <MeetingPrepContainer
              filter={globalFilter}
              filterLabel={filterLabel}
              onSelectCompany={(id) => selectCompany(id)}
            />
          </div>
          {detailNode}
        </>
      );
    } else {
      body = detailNode;
    }
  } else if (dashboard === "pay_migration") {
    // Pay Migration ignores the global filter — the dashboard's own Default/All
    // toggle is the only filter that applies here.
    body = (
      <PayMigrationContainer
        payFilter={payFilter}
        onSelectCompany={(c) => selectCompany(c.id)}
      />
    );
  } else if (dashboard === "meeting_prep") {
    body = (
      <MeetingPrepContainer
        filter={globalFilter}
        filterLabel={filterLabel}
        onSelectCompany={(id) => selectCompany(id)}
      />
    );
  } else if (dashboard === "search") {
    body = (
      <SearchContainer
        filter={globalFilter}
        onSelectCompany={(id) => selectCompany(id)}
      />
    );
  } else {
    // Portfolio is the default dashboard and the fallback for any key that
    // somehow reaches here (e.g. Bloom, which is not yet wired up).
    body = (
      <PortfolioContainer
        filter={globalFilter}
        filterLabel={filterLabel}
        showAvatar={scopeHasMixedOwners(globalFilter)}
        onSelectCompany={(id) => selectCompany(id)}
        search={portfolioSearch}
        onSearchChange={setPortfolioSearch}
        view={portfolioView}
      />
    );
  }

  return (
    <>
      <div style={{ minHeight: "100vh", background: "var(--page-bg)" }}>
        <TopBar
          filter={globalFilter}
          setFilter={setGlobalFilter}
          isDefault={isDefault}
          setAsDefault={setAsDefault}
          clearDefault={clearDefault}
          onOpenCmdk={() => setCmdkOpen(true)}
          showBack={showBack}
          onBack={back}
          dashboard={dashboard}
          setDashboard={setDashboard}
        />
        <VariantPicker
          dashboard={dashboard}
          payFilter={payFilter}
          setPayFilter={setPayFilter}
          portfolioView={portfolioView}
          setPortfolioView={setPortfolioView}
        />
        <main>
          <ViewTransition dashboard={dashboard}>
            {body}
          </ViewTransition>
        </main>
      </div>

      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onPickCompany={handlePaletteCompany}
        onAction={handlePaletteAction}
        hasCurrentCompany={!!selectedCompanyId}
      />


      <ShortcutCheatSheet
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        dashboard={dashboard}
        hasSelectedCompany={!!selectedCompanyId}
      />

      <LiveRegion />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--moss)",
            color: "var(--text-on-moss)",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            zIndex: 200,
            boxShadow: "var(--shadow-modal)",
            animation: "fadeIn 200ms ease",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

function DetailLoading() {
  return (
    <div className="animate-pulse page-shell" style={{ paddingTop: 28, paddingBottom: 28 }}>
      <div style={{ height: 56, width: "40%", background: "var(--hairline)", borderRadius: 8, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 76, background: "var(--hairline)", borderRadius: 14 }} />
        ))}
      </div>
      <div style={{ height: 120, background: "var(--hairline)", borderRadius: 16, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ height: 320, background: "var(--hairline)", borderRadius: 16 }} />
        <div style={{ height: 320, background: "var(--hairline)", borderRadius: 16 }} />
      </div>
    </div>
  );
}
