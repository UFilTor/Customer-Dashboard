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
  type OnboardingSubview,
} from "@/components/design/VariantPicker";
import { CommandPalette, type PaletteAction } from "@/components/design/CommandPalette";
import { ViewTransition } from "@/components/design/ViewTransition";
import { BriefingView } from "@/components/design/views/BriefingView";
import { SplitView } from "@/components/design/views/SplitView";
import { CompanyDetail } from "@/components/design/CompanyDetail";
// Heavy variant containers — code-split so the Status dashboard's first paint
// doesn't pay the cost of OnboardingView (2.4k lines) + PayMigrationView (1.3k
// lines). They load on first navigation to their respective dashboard.
const PayMigrationContainer = dynamic(
  () =>
    import("@/components/design/views/PayMigrationContainer").then((m) => m.PayMigrationContainer),
  { ssr: false }
);
const OnboardingContainer = dynamic(
  () =>
    import("@/components/design/views/OnboardingContainer").then((m) => m.OnboardingContainer),
  { ssr: false }
);
const RetentionContainer = dynamic(
  () =>
    import("@/components/design/views/RetentionContainer").then((m) => m.RetentionContainer),
  { ssr: false }
);
const SearchContainer = dynamic(
  () =>
    import("@/components/design/views/SearchContainer").then((m) => m.SearchContainer),
  { ssr: false }
);
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";
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
  onboardingSubview: OnboardingSubview;
  selectedCompanyId: string | null;
};

function readUrlState(): Partial<UrlState> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const out: Partial<UrlState> = {};
  const d = sp.get("d");
  if (d === "status" || d === "onboarding" || d === "retention" || d === "pay_migration" || d === "search") out.dashboard = d;
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
  const os = sp.get("os");
  if (os === "meetings" || os === "attention") out.onboardingSubview = os;
  const c = sp.get("c");
  if (c) out.selectedCompanyId = c;
  return out;
}

function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams();
  if (state.dashboard !== "status") sp.set("d", state.dashboard);
  if (state.dashboard === "status" && state.variant !== "briefing") sp.set("v", state.variant);
  if (state.filter.kind !== "all") {
    sp.set("f", state.filter.kind);
    if (state.filter.kind === "region") sp.set("fv", state.filter.region);
    if (state.filter.kind === "person") sp.set("fv", state.filter.ownerId);
  }
  if (state.dashboard === "pay_migration" && state.payFilter !== "default") {
    sp.set("pf", state.payFilter);
  }
  if (state.dashboard === "onboarding" && state.onboardingSubview !== "meetings") {
    sp.set("os", state.onboardingSubview);
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
  // like /?d=onboarding lands on Onboarding within a frame of hydration.
  const [dashboard, setDashboard] = useState<DashboardKey>("status");
  const [variant, setVariant] = useState<Variant>("briefing");
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>(ALL_FILTER);
  const [defaultFilter, setDefaultFilter] = useState<GlobalFilter | null>(null);
  const [payFilter, setPayFilter] = useState<"default" | "all">("default");
  const [onboardingSubview, setOnboardingSubview] = useState<OnboardingSubview>("meetings");

  // Data state — seed from server-rendered payload when available so the
  // first paint already has the attention rows. Without it (refresh during
  // a server outage, or a client-only navigation), `loadAttention` fills in.
  const [attention, setAttention] = useState<AttentionResponse | null>(initialAttention);
  const [isLoadingAttention, setIsLoadingAttention] = useState(initialAttention === null);
  const [errorAttention, setErrorAttention] = useState<string | null>(null);

  // Selection state. Each Status-dashboard variant (briefing/split) owns
  // its own slot — switching variants brings back what was selected there last,
  // so a detail view in split doesn't bleed over into briefing or vice versa.
  // Onboarding/pay_migration use the shared `_other` slot (they don't have
  // sub-variants today). Retention has its own slot so its (future) selection
  // can't bleed into Onboarding's.
  type SelectionScope = Variant | "_other" | "retention";
  const [selectionByScope, setSelectionByScope] = useState<Record<SelectionScope, string | null>>({
    briefing: null,
    split: null,
    _other: null,
    retention: null,
  });
  const selectionScope: SelectionScope =
    dashboard === "status" ? variant
    : dashboard === "retention" ? "retention"
    : "_other";
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
  const [prevDashboard, setPrevDashboard] = useState(dashboard);
  if (prevDashboard !== dashboard) {
    setPrevDashboard(dashboard);
    setSelectionByScope({ briefing: null, split: null, _other: null, retention: null });
    setCompanyData(null);
    setDetailError(null);
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

  // Onboarding meeting prep focus levels. Drives whether ←/→/↑/↓/Enter route
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
    window.addEventListener("ud-meeting-focused-state", onMeetingState);
    window.addEventListener("ud-history-focused-state", onHistoryState);
    return () => {
      window.removeEventListener("ud-meeting-focused-state", onMeetingState);
      window.removeEventListener("ud-history-focused-state", onHistoryState);
    };
  }, []);

  // Retention meeting prep focus levels — same shape as onboarding's, but on
  // their own event channel so the two dashboards' keyboard nav don't collide.
  const retentionMeetingFocusedRef = useRef(false);
  const retentionHistoryFocusedRef = useRef(false);
  useEffect(() => {
    function onMeetingState(e: Event) {
      retentionMeetingFocusedRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    function onHistoryState(e: Event) {
      retentionHistoryFocusedRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    window.addEventListener("ud-retention-meeting-focused-state", onMeetingState);
    window.addEventListener("ud-retention-history-focused-state", onHistoryState);
    return () => {
      window.removeEventListener("ud-retention-meeting-focused-state", onMeetingState);
      window.removeEventListener("ud-retention-history-focused-state", onHistoryState);
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

    if (fromUrl.dashboard) {
      setDashboard(fromUrl.dashboard);
    } else {
      const d = ls("ud-v2-dashboard");
      if (d === "onboarding" || d === "retention" || d === "pay_migration" || d === "search") setDashboard(d);
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
    if (fromUrl.onboardingSubview) {
      setOnboardingSubview(fromUrl.onboardingSubview);
    } else if (ls("ud-v2-onboarding-subview") === "attention") {
      setOnboardingSubview("attention");
    }
    if (fromUrl.selectedCompanyId) {
      const dash = fromUrl.dashboard ?? "status";
      const scope: SelectionScope =
        dash === "status" ? (fromUrl.variant ?? "briefing")
        : dash === "retention" ? "retention"
        : "_other";
      setSelectionByScope((prev) => ({ ...prev, [scope]: fromUrl.selectedCompanyId! }));
    }
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
      onboardingSubview,
      selectedCompanyId: selectionByScope[
        dashboard === "status" ? variant
        : dashboard === "retention" ? "retention"
        : "_other"
      ],
    });
    try {
      localStorage.setItem("ud-v2-variant", variant);
      localStorage.setItem("ud-v2-dashboard", dashboard);
      localStorage.setItem("ud-v2-filter", serializeFilter(globalFilter));
      localStorage.setItem("ud-v2-pay-filter", payFilter);
      localStorage.setItem("ud-v2-onboarding-subview", onboardingSubview);
    } catch {/* ignore */}
  }, [variant, dashboard, globalFilter, payFilter, onboardingSubview, selectionByScope]);

  // Honor browser back/forward — re-read URL params on popstate and apply.
  useEffect(() => {
    function onPop() {
      const s = readUrlState();
      if (s.dashboard) setDashboard(s.dashboard);
      if (s.variant) setVariant(s.variant);
      if (s.filter) setGlobalFilter(s.filter);
      if (s.payFilter) setPayFilter(s.payFilter);
      if (s.onboardingSubview) setOnboardingSubview(s.onboardingSubview);
      // Selection: drop into the matching scope.
      const popDash = s.dashboard ?? "status";
      const scope: SelectionScope =
        popDash === "status" ? (s.variant ?? "briefing")
        : popDash === "retention" ? "retention"
        : "_other";
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

  // Browser back/forward navigation
  useEffect(() => {
    function onPopState() {
      setSelectedCompanyIdRef.current(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
    cmdkOpen, showHelp, selectedCompanyId, dashboard, variant, orderedCompanies, onboardingSubview,
    filter: globalFilter,
  });
  stateRef.current = {
    cmdkOpen, showHelp, selectedCompanyId, dashboard, variant, orderedCompanies, onboardingSubview,
    filter: globalFilter,
  };

  // "g" prefix: press g, then [s|o|r|p|b|l] to jump dashboards (Gmail-style).
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
          s: "status",
          o: "onboarding",
          r: "retention",
          p: "pay_migration",
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
        // Unknown second key — close the picker; fall through to normal handling.
        window.dispatchEvent(new Event("ud-dashboard-picker-close"));
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

      // Onboarding subviews: 1 = meeting prep, 2 = needs attention.
      // Fires from any state (mirrors Status 1/2/3) so the user can jump back
      // out of a deep detail with a single keystroke.
      if (s.dashboard === "onboarding") {
        if (e.key === "1") {
          e.preventDefault();
          setOnboardingSubview("meetings");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setOnboardingSubview("attention");
          return;
        }
      }

      // Pay Migration filter: 1 = Default, 2 = All. Same any-state policy.
      if (s.dashboard === "pay_migration") {
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

      // Meeting prep nav — three modes:
      //   1. nothing focused      → ←/→ shifts day, ↑/↓ starts cycling meetings
      //   2. meeting focused      → → enters Previous activity, ← unfocuses,
      //                             ↑/↓ cycles meetings, Enter opens
      //   3. history focused      → ←/→ exits, ↑/↓ cycles history items,
      //                             Enter or Space toggles expand
      const inMeetingPrep =
        s.dashboard === "onboarding" &&
        s.onboardingSubview === "meetings" &&
        !s.selectedCompanyId;

      if (inMeetingPrep && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? "prev" : "next";
        if (historyFocusedRef.current) {
          // Mode 3: ← exits history, → no-op (user already inside the section).
          if (dir === "prev") window.dispatchEvent(new Event("ud-onboarding-history-exit"));
          return;
        }
        if (meetingFocusedRef.current) {
          // Mode 2: → enters Previous activity, ← drops focus back to top.
          if (dir === "next") window.dispatchEvent(new Event("ud-onboarding-history-enter"));
          else window.dispatchEvent(new Event("ud-onboarding-meeting-unfocus"));
          return;
        }
        // Mode 1: walk the day strip.
        window.dispatchEvent(
          new CustomEvent("ud-onboarding-day-shift", { detail: dir })
        );
        return;
      }

      if (inMeetingPrep && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? "prev" : "next";
        if (historyFocusedRef.current) {
          window.dispatchEvent(
            new CustomEvent("ud-onboarding-history-nav", { detail: dir })
          );
        } else {
          window.dispatchEvent(
            new CustomEvent("ud-onboarding-meeting-nav", { detail: dir })
          );
        }
        return;
      }

      if (inMeetingPrep && e.key === "Enter") {
        e.preventDefault();
        if (historyFocusedRef.current) {
          window.dispatchEvent(new Event("ud-onboarding-history-toggle"));
        } else {
          window.dispatchEvent(new Event("ud-onboarding-meeting-open"));
        }
        return;
      }

      // Retention meeting prep — same three modes as onboarding's nav, on its
      // own event channel so we don't cross-fire to the wrong dashboard.
      const inRetentionPrep =
        s.dashboard === "retention" && !s.selectedCompanyId;

      if (inRetentionPrep && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? "prev" : "next";
        if (retentionHistoryFocusedRef.current) {
          if (dir === "prev") window.dispatchEvent(new Event("ud-retention-history-exit"));
          return;
        }
        if (retentionMeetingFocusedRef.current) {
          if (dir === "next") window.dispatchEvent(new Event("ud-retention-history-enter"));
          else window.dispatchEvent(new Event("ud-retention-meeting-unfocus"));
          return;
        }
        window.dispatchEvent(
          new CustomEvent("ud-retention-day-shift", { detail: dir })
        );
        return;
      }

      if (inRetentionPrep && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? "prev" : "next";
        if (retentionHistoryFocusedRef.current) {
          window.dispatchEvent(
            new CustomEvent("ud-retention-history-nav", { detail: dir })
          );
        } else {
          window.dispatchEvent(
            new CustomEvent("ud-retention-meeting-nav", { detail: dir })
          );
        }
        return;
      }

      // Note: no Enter handler for retention. The brief is fully expanded
      // inline (no detail panel to open), so Enter has nothing to do.

      if (inMeetingPrep && (e.key === " " || e.code === "Space") && historyFocusedRef.current) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-onboarding-history-toggle"));
        return;
      }

      if (
        inRetentionPrep &&
        (e.key === " " || e.code === "Space") &&
        retentionHistoryFocusedRef.current
      ) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-retention-history-toggle"));
        return;
      }

      // List navigation in full-page views (Briefing, Onboarding Needs
      // attention). The active view subscribes to ud-list-nav / ud-list-open
      // and manages its own focused state.
      const inListView =
        !s.selectedCompanyId &&
        ((s.dashboard === "status" && s.variant === "briefing") ||
          (s.dashboard === "onboarding" && s.onboardingSubview === "attention"));
      if (inListView && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-list-nav", { detail: e.key === "ArrowUp" ? "prev" : "next" })
        );
        return;
      }
      if (inListView && e.key === "Enter") {
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
      // without opening the pill, for fast filter sweeps.
      if (e.key.toLowerCase() === "f") {
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
      // the page level; Onboarding + Pay Migration containers subscribe to
      // ud-refresh-dashboard and refetch themselves.
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
    if (dashboard === "status" && variant === "split") {
      body = (
        <SplitView
          companies={filteredCompanies}
          selectedId={selectedCompanyId}
          detailData={companyData}
          isLoadingDetail={isLoadingDetail}
          onSelect={(c) => selectCompany(c.id)}
          updatedAt={attention?.updatedAt || null}
          showAvatar={globalFilter.kind !== "person"}
        />
      );
    } else if (companyData && !isLoadingDetail) {
      body = (
        <CompanyDetail
          companyId={selectedCompanyId}
          data={companyData}
        />
      );
    } else if (detailError) {
      body = <div style={{ padding: 32, textAlign: "center", color: "var(--rust)" }}>{detailError}</div>;
    } else {
      body = <DetailLoading />;
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
  } else if (dashboard === "onboarding") {
    body = (
      <OnboardingContainer
        subview={onboardingSubview}
        filter={globalFilter}
        filterLabel={filterLabel}
        onSelectDeal={(d) => {
          if (d.companyId) selectCompany(d.companyId);
        }}
      />
    );
  } else if (dashboard === "retention") {
    body = (
      <RetentionContainer
        filter={globalFilter}
        filterLabel={filterLabel}
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
          <div style={{ padding: 32, textAlign: "center", color: "var(--rust)" }}>
            {errorAttention}
            <div style={{ marginTop: 12 }}>
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
            </div>
          </div>
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
          onboardingSubview={onboardingSubview}
          setOnboardingSubview={setOnboardingSubview}
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
