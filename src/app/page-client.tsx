"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  AttentionResponse,
  CompanyDetail as CompanyDetailData,
  CompanySearchResult,
  OwnerMap,
  StageMap,
} from "@/lib/types";
import { TopBar } from "@/components/design/TopBar";
import {
  VariantPicker,
  DASHBOARDS,
  type Variant,
  type DashboardKey,
} from "@/components/design/VariantPicker";
import { CommandPalette, type PaletteAction } from "@/components/design/CommandPalette";
import { ViewTransition } from "@/components/design/ViewTransition";
import { BriefingView } from "@/components/design/views/BriefingView";
import { SplitView } from "@/components/design/views/SplitView";
import { CompanyDetail } from "@/components/design/CompanyDetail";
// Heavy variant containers — code-split so the Status dashboard's first paint
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
import { flattenGroups, SECTION_ORDER, sortBySignal, type FlatCompany } from "@/lib/signals";
import {
  effectiveOwnerIds,
  filterLabel as buildFilterLabel,
  parseFilter,
  serializeFilter,
  ALL_FILTER,
  OWNERS,
  type GlobalFilter,
} from "@/lib/owners";
import { addRecentCompany, computeRevenueFromDetail } from "@/lib/recent-companies";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { reportFreshness } from "@/lib/freshness";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";

type DetailData = CompanyDetailData & { owners: OwnerMap; stages: StageMap };

// URL ↔ state helpers. Keeping the URL canonical for view state means back /
// forward / refresh / share-link all work. localStorage stays as a fallback
// for the very first visit (and for the per-variant selection memory map,
// which is too noisy for the URL).
type UrlState = {
  dashboard: DashboardKey;
  variant: Variant;
  filter: GlobalFilter;
  payFilter: "default" | "all";
  selectedCompanyId: string | null;
};

function readUrlState(): Partial<UrlState> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const out: Partial<UrlState> = {};
  const d = sp.get("d");
  if (
    d === "status" ||
    d === "meeting_prep" ||
    d === "portfolio" ||
    d === "pay_migration" ||
    d === "search"
  )
    out.dashboard = d;
  const v = sp.get("v");
  if (v === "briefing" || v === "split") out.variant = v;
  const fk = sp.get("f");
  const fv = sp.get("fv");
  if (fk === "region" && (fv === "DK" || fv === "SE" || fv === "IT")) {
    out.filter = { kind: "region", region: fv };
  } else if (fk === "person" && fv) {
    out.filter = { kind: "person", ownerId: fv };
  } else if (fk === "all") {
    out.filter = { kind: "all" };
  }
  const pf = sp.get("pf");
  if (pf === "default" || pf === "all") out.payFilter = pf;
  const c = sp.get("c");
  if (c) out.selectedCompanyId = c;
  return out;
}

function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams();
  if (state.dashboard !== "portfolio") sp.set("d", state.dashboard);
  if (state.dashboard === "status" && state.variant !== "briefing") sp.set("v", state.variant);
  if (state.filter.kind !== "all") {
    sp.set("f", state.filter.kind);
    if (state.filter.kind === "region") sp.set("fv", state.filter.region);
    if (state.filter.kind === "person") sp.set("fv", state.filter.ownerId);
  }
  if (state.dashboard === "pay_migration" && state.payFilter !== "default") {
    sp.set("pf", state.payFilter);
  }
  if (state.selectedCompanyId) sp.set("c", state.selectedCompanyId);
  const qs = sp.toString();
  const next = qs ? `?${qs}` : window.location.pathname;
  // Use replaceState to avoid spamming the back-button history on every nav.
  // Pushing once per nav would also work but feels heavy for tabbed UIs.
  window.history.replaceState(null, "", next);
}

interface DashboardClientProps {
  // Server-rendered initial attention payload. When provided, the client
  // skips the first `/api/attention` fetch — first paint already has the
  // rows. Tab-focus refetch / R-key refresh / filter changes still fire
  // through the API route as usual.
  initialAttention: AttentionResponse | null;
}

export default function DashboardClient({ initialAttention }: DashboardClientProps) {
  // View state — start with hardcoded defaults so server and client first
  // render agree (no hydration mismatch). The `useEffect` below reads URL
  // params and localStorage after mount and applies them, so a deep link
  // like /?d=portfolio lands on Portfolio within a frame of hydration.
  const [dashboard, setDashboard] = useState<DashboardKey>("portfolio");
  const [variant, setVariant] = useState<Variant>("briefing");
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>(ALL_FILTER);
  const [defaultFilter, setDefaultFilter] = useState<GlobalFilter | null>(null);
  const [payFilter, setPayFilter] = useState<"default" | "all">("default");

  // Data state — seed from server-rendered payload when available so the
  // first paint already has the attention rows. Without it (refresh during
  // a server outage, or a client-only navigation), `loadAttention` fills in.
  const [attention, setAttention] = useState<AttentionResponse | null>(initialAttention);
  const [isLoadingAttention, setIsLoadingAttention] = useState(initialAttention === null);
  const [errorAttention, setErrorAttention] = useState<string | null>(null);

  // Report the Status payload's build time so the TopBar freshness label
  // can show data age. Covers both the SSR-seeded payload and refetches.
  useEffect(() => {
    reportFreshness("status", attention?.generatedAt);
  }, [attention]);

  // Selection state. Each Status-dashboard variant (briefing/split) owns
  // its own slot — switching variants brings back what was selected there last,
  // so a detail view in split doesn't bleed over into briefing or vice versa.
  // Other dashboards share the `_other` slot.
  type SelectionScope = Variant | "_other";
  const [selectionByScope, setSelectionByScope] = useState<Record<SelectionScope, string | null>>({
    briefing: null,
    split: null,
    _other: null,
  });
  const selectionScope: SelectionScope =
    dashboard === "status" ? variant : "_other";
  const selectedCompanyId = selectionByScope[selectionScope];
  const setSelectedCompanyId = useCallback(
    (id: string | null) => {
      setSelectionByScope((prev) =>
        prev[selectionScope] === id ? prev : { ...prev, [selectionScope]: id }
      );
    },
    [selectionScope]
  );
  // Mirror the latest setter into a ref so the keyboard listener (attached
  // once on mount) always writes to the current variant's selection slot.
  // Without this, switching from briefing → split kept the listener pointed
  // at the briefing slot and arrow keys silently no-op'd.
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
  // and selectionByScope from URL in the same batch; without this gate, the
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
      setSelectionByScope({ briefing: null, split: null, _other: null });
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
    if (fromUrl.variant) {
      setVariant(fromUrl.variant);
    } else if (ls("ud-v2-variant") === "split") {
      setVariant("split");
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
    if (fromUrl.selectedCompanyId) {
      const dash = fromUrl.dashboard ?? "status";
      const scope: SelectionScope =
        dash === "status" ? (fromUrl.variant ?? "briefing") : "_other";
      setSelectionByScope((prev) => ({ ...prev, [scope]: fromUrl.selectedCompanyId! }));
    }
    // Mount-init effect intentionally runs once. The `dashboard` reference
    // inside is the initial default; we only branch on it to detect "URL
    // wants a different dashboard than the current default".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror state into the URL (canonical) and localStorage (for first-load
  // restoration). Runs after the mount-init effect above, so the first sync
  // writes the seeded state back to the URL in canonical form.
  useEffect(() => {
    if (!didMountRef.current) return;
    writeUrlState({
      dashboard,
      variant,
      filter: globalFilter,
      payFilter,
      selectedCompanyId:
        selectionByScope[dashboard === "status" ? variant : "_other"],
    });
    try {
      localStorage.setItem("ud-v2-variant", variant);
      localStorage.setItem("ud-v2-dashboard", dashboard);
      localStorage.setItem("ud-v2-filter", serializeFilter(globalFilter));
      localStorage.setItem("ud-v2-pay-filter", payFilter);
    } catch {
      /* ignore */
    }
  }, [variant, dashboard, globalFilter, payFilter, selectionByScope]);

  // Honor browser back/forward — re-read URL params on popstate and apply.
  useEffect(() => {
    function onPop() {
      const s = readUrlState();
      if (s.dashboard) setDashboard(s.dashboard);
      if (s.variant) setVariant(s.variant);
      if (s.filter) setGlobalFilter(s.filter);
      if (s.payFilter) setPayFilter(s.payFilter);
      // Selection: drop into the matching scope.
      const popDash = s.dashboard ?? "status";
      const scope: SelectionScope =
        popDash === "status" ? (s.variant ?? "briefing") : "_other";
      setSelectionByScope((prev) => ({ ...prev, [scope]: s.selectedCompanyId ?? null }));
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

  // Fetch attention data
  const loadAttention = useCallback(async () => {
    setIsLoadingAttention(true);
    setErrorAttention(null);
    try {
      const res = await apiFetch("/api/attention");
      if (!res.ok) {
        setErrorAttention(friendlyErrorMessage(null, res.status));
        return;
      }
      const json: AttentionResponse = await res.json();
      setAttention(json);
    } catch (err) {
      setErrorAttention(friendlyErrorMessage(err));
    } finally {
      setIsLoadingAttention(false);
    }
  }, []);

  // Skip the first auto-fetch when the server already supplied the payload —
  // otherwise we'd refetch immediately after hydration and waste the work.
  // After this initial mount, loadAttention is what tab-focus / R-key /
  // filter changes invoke, so the ref-based skip is a one-shot.
  const skipInitialAttentionFetchRef = useRef(initialAttention !== null);
  useEffect(() => {
    if (skipInitialAttentionFetchRef.current) {
      skipInitialAttentionFetchRef.current = false;
      return;
    }
    loadAttention();
  }, [loadAttention]);

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
    // Push history only on the first transition from list → detail. Switching
    // between accounts (split view prev/next, palette pick while a company is
    // open) replaces in place so browser back always returns to the list.
    if (selectedCompanyId == null) {
      window.history.pushState({ company: true }, "");
    }
    setSelectedCompanyId(id);
  }

  function back() {
    if (selectedCompanyId) {
      if (window.history.state?.company) {
        window.history.back();
      } else {
        setSelectedCompanyId(null);
      }
    }
  }

  // Derived: filtered, flat company list
  const allCompanies: FlatCompany[] = useMemo(
    () => (attention ? flattenGroups(attention.groups) : []),
    [attention]
  );
  const filteredCompanies: FlatCompany[] = useMemo(() => {
    const ids = effectiveOwnerIds(globalFilter);
    if (!ids) return allCompanies;
    return allCompanies.filter((c) => (c.ownerId ? ids.has(c.ownerId) : false));
  }, [allCompanies, globalFilter]);

  // Same sort order as the visible Brief / Split sections so keyboard nav
  // tracks what the user is looking at instead of the raw API order.
  const orderedCompanies: FlatCompany[] = useMemo(() => {
    const out: FlatCompany[] = [];
    for (const sig of SECTION_ORDER) {
      out.push(...sortBySignal(sig, filteredCompanies.filter((c) => c.signal === sig)));
    }
    return out;
  }, [filteredCompanies]);

  // Human-readable label for the active filter, shown in the briefing header so
  // a sticky filter never silently hides results.
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
    cmdkOpen, showHelp, selectedCompanyId, dashboard, variant, orderedCompanies,
    filter: globalFilter,
  });
  // Mirror the latest values via an effect (no deps) so the ref update
  // happens after render commits, satisfying react-hooks/refs.
  useEffect(() => {
    stateRef.current = {
      cmdkOpen, showHelp, selectedCompanyId, dashboard, variant, orderedCompanies,
      filter: globalFilter,
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
          if (window.history.state?.company) window.history.back();
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
        const dashMap: Record<string, DashboardKey | undefined> = {
          p: "portfolio",
          s: "status",
          m: "meeting_prep",
          u: "pay_migration",
          b: "bloom",
          l: "search",
        };
        const target = dashMap[k];
        if (target) {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-dashboard-picker-close"));
          const dash = DASHBOARDS.find((d) => d.key === target);
          if (dash?.available) {
            setDashboard(target);
          } else {
            showToast(`${dash?.label ?? target}: coming soon`);
          }
          return;
        }
        // Unknown second key — close the picker and swallow the keystroke.
        // Without the early return, the second key (e.g. r, ?, f, 1, 2) would
        // fall through to refresh / help / filter / variant handlers, which
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

      // Layout variants 1/2/3 — Status dashboard, any state.
      // Switching variant within the Status dashboard. Each variant owns its
      // own selection (per-scope memory), so the destination variant snaps
      // back to whatever was selected there last — including null.
      if (s.dashboard === "status") {
        if (e.key === "1") {
          e.preventDefault();
          setVariant("briefing");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setVariant("split");
          return;
        }
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
        // Plain S cycles the sort order; Shift+S opens the sort selector
        // popup (handled by PortfolioView's Toolbar local listener).
        if (e.key.toLowerCase() === "s" && !e.shiftKey) {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-portfolio-sort-cycle"));
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

      // List navigation in full-page views (Briefing, Portfolio).
      // The active view subscribes to ud-list-nav / ud-list-open
      // and manages its own focused state. When the Portfolio Signals or
      // Sort popup is open, ↑/↓/Enter belong to the popup, not the list.
      const inListView =
        !s.selectedCompanyId &&
        ((s.dashboard === "status" && s.variant === "briefing") ||
          s.dashboard === "portfolio");
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

      // Up / Down: cycle the queue in Split view (Overview tab path).
      if (
        s.dashboard === "status" &&
        s.variant === "split" &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        e.preventDefault();
        const list = s.orderedCompanies;
        if (list.length === 0) return;
        const curIdx = list.findIndex((c) => c.id === s.selectedCompanyId);
        const nextIdx =
          curIdx === -1
            ? 0
            : e.key === "ArrowUp"
              ? (curIdx - 1 + list.length) % list.length
              : (curIdx + 1) % list.length;
        const next = list[nextIdx];
        if (!next || next.id === s.selectedCompanyId) return;
        if (s.selectedCompanyId == null) {
          window.history.pushState({ company: true }, "");
        }
        setSelectedCompanyIdRef.current(next.id);
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
            next = { kind: "region", region: "DK" };
          } else if (current.kind === "region") {
            // First time landing on region from cycle: DK. Within region,
            // cycle DK → SE → IT → person.
            if (current.region === "DK") next = { kind: "region", region: "SE" };
            else if (current.region === "SE") next = { kind: "region", region: "IT" };
            else next = { kind: "person", ownerId: OWNERS[0].id };
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
        window.dispatchEvent(new Event("ud-filter-type-open"));
        return;
      }

      // R — refresh the active dashboard's data. Status is fetched here at
      // the page level; Portfolio + Meeting prep + Pay Migration containers
      // subscribe to ud-refresh-dashboard and refetch themselves.
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (s.dashboard === "status") {
          loadAttention();
        } else {
          window.dispatchEvent(new Event("ud-refresh-dashboard"));
        }
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
  }, [showToast, loadAttention]);

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
      const s = stateRef.current;
      if (s.dashboard === "status") {
        loadAttention();
      } else {
        window.dispatchEvent(new Event("ud-refresh-dashboard"));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadAttention]);

  // Palette actions
  function handlePaletteAction(action: PaletteAction) {
    switch (action) {
      case "refresh":
        loadAttention();
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
    // Status + Split is the only layout that keeps the queue visible alongside the detail.
    const detailNode =
      dashboard === "status" && variant === "split" ? (
        <SplitView
          companies={filteredCompanies}
          selectedId={selectedCompanyId}
          detailData={companyData}
          isLoadingDetail={isLoadingDetail}
          onSelect={(c) => selectCompany(c.id)}
          updatedAt={attention?.updatedAt || null}
          showAvatar={globalFilter.kind !== "person"}
        />
      ) : companyData && !isLoadingDetail ? (
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
  } else if (dashboard === "portfolio") {
    body = (
      <PortfolioContainer
        filter={globalFilter}
        filterLabel={filterLabel}
        showAvatar={globalFilter.kind !== "person"}
        onSelectCompany={(id) => selectCompany(id)}
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
    // Status list views
    body = (() => {
      if (isLoadingAttention) return <ListLoading />;
      if (errorAttention) {
        return (
          <EditorialEmpty
            tone="error"
            headline="Could not load the attention queue."
            caption={errorAttention}
            action={
              <button
                onClick={loadAttention}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "var(--moss)",
                  color: "var(--text-on-moss)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            }
          />
        );
      }
      if (variant === "briefing") {
        return (
          <BriefingView
            companies={filteredCompanies}
            onSelect={(c) => selectCompany(c.id)}
            filterLabel={filterLabel}
            showAvatar={globalFilter.kind !== "person"}
          />
        );
      }
      return (
        <SplitView
          companies={filteredCompanies}
          selectedId={null}
          detailData={null}
          isLoadingDetail={false}
          onSelect={(c) => selectCompany(c.id)}
          updatedAt={attention?.updatedAt || null}
          showAvatar={globalFilter.kind !== "person"}
        />
      );
    })();
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
          variant={variant}
          setVariant={(v) => { setVariant(v); }}
          dashboard={dashboard}
          payFilter={payFilter}
          setPayFilter={setPayFilter}
        />
        <main>
          <ViewTransition dashboard={dashboard} variant={variant}>
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
        variant={variant}
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

function ListLoading() {
  return (
    <div className="animate-pulse" style={{ padding: "32px 28px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ height: 200, background: "var(--hairline)", borderRadius: 20, marginBottom: 28 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 32 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 96, background: "var(--hairline)", borderRadius: 14 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 28 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 180, background: "var(--hairline)", borderRadius: 16 }} />
        ))}
      </div>
      <div style={{ height: 320, background: "var(--hairline)", borderRadius: 14 }} />
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="animate-pulse" style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
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
