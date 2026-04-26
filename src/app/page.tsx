"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { KanbanView } from "@/components/design/views/KanbanView";
import { CompanyDetail } from "@/components/design/CompanyDetail";
import { PayMigrationContainer } from "@/components/design/views/PayMigrationContainer";
import { OnboardingContainer } from "@/components/design/views/OnboardingContainer";
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";
import { flattenGroups, SECTION_ORDER, sortBySignal, type FlatCompany } from "@/lib/signals";
import {
  effectiveOwnerIds,
  filterLabel as buildFilterLabel,
  parseFilter,
  serializeFilter,
  ALL_FILTER,
  type GlobalFilter,
} from "@/lib/owners";
import { addRecentCompany, computeRevenueFromDetail } from "@/lib/recent-companies";

type DetailData = CompanyDetailData & { owners: OwnerMap; stages: StageMap };

const HUBSPOT_PORTAL = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

export default function Dashboard() {
  // View state
  const [dashboard, setDashboard] = useState<DashboardKey>("status");
  const [variant, setVariant] = useState<Variant>("briefing");
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>(ALL_FILTER);
  const [defaultFilter, setDefaultFilter] = useState<GlobalFilter | null>(null);
  const [payFilter, setPayFilter] = useState<"default" | "all">("default");
  const [onboardingSubview, setOnboardingSubview] = useState<OnboardingSubview>("meetings");

  // Data state
  const [attention, setAttention] = useState<AttentionResponse | null>(null);
  const [isLoadingAttention, setIsLoadingAttention] = useState(true);
  const [errorAttention, setErrorAttention] = useState<string | null>(null);

  // Selection state. Each Status-dashboard variant (briefing/split/kanban) owns
  // its own slot — switching variants brings back what was selected there last,
  // so a detail view in split doesn't bleed over into briefing or vice versa.
  // Onboarding/pay_migration use the shared `_other` slot (they don't have
  // sub-variants today).
  type SelectionScope = Variant | "_other";
  const [selectionByScope, setSelectionByScope] = useState<Record<SelectionScope, string | null>>({
    briefing: null,
    split: null,
    kanban: null,
    _other: null,
  });
  const selectionScope: SelectionScope = dashboard === "status" ? variant : "_other";
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

  // UI state
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  // Persist view + filter choices across reloads.
  // Filter resolution order on load: pinned default → last-used → All.
  // Pinned default loads on every refresh; last-used keeps the session sticky
  // for users who haven't pinned anything.
  useEffect(() => {
    try {
      const v = localStorage.getItem("ud-v2-variant");
      if (v === "briefing" || v === "split" || v === "kanban") setVariant(v);
      const d = localStorage.getItem("ud-v2-dashboard");
      if (d === "status" || d === "pay_migration" || d === "onboarding") setDashboard(d);
      const pinned = parseFilter(localStorage.getItem("ud-v2-filter-default"));
      if (pinned) setDefaultFilter(pinned);
      const last = parseFilter(localStorage.getItem("ud-v2-filter"));
      const initial = pinned ?? last;
      if (initial) setGlobalFilter(initial);
      const p = localStorage.getItem("ud-v2-pay-filter");
      if (p === "default" || p === "all") setPayFilter(p);
      const ob = localStorage.getItem("ud-v2-onboarding-subview");
      if (ob === "meetings" || ob === "attention") setOnboardingSubview(ob);
    } catch {/* ignore */}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ud-v2-variant", variant);
      localStorage.setItem("ud-v2-dashboard", dashboard);
      localStorage.setItem("ud-v2-filter", serializeFilter(globalFilter));
      localStorage.setItem("ud-v2-pay-filter", payFilter);
      localStorage.setItem("ud-v2-onboarding-subview", onboardingSubview);
    } catch {/* ignore */}
  }, [variant, dashboard, globalFilter, payFilter, onboardingSubview]);

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
      const res = await fetch("/api/attention");
      if (!res.ok) throw new Error("Failed to load attention");
      const json: AttentionResponse = await res.json();
      setAttention(json);
    } catch {
      setErrorAttention("Could not load data. Try refreshing.");
    } finally {
      setIsLoadingAttention(false);
    }
  }, []);

  useEffect(() => { loadAttention(); }, [loadAttention]);

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
        const res = await fetch(`/api/companies/${selectedCompanyId}`);
        if (!res.ok) throw new Error("Failed to load company");
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
      } catch {
        if (!cancelled) setDetailError("Could not load company.");
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

  const totalCount = filteredCompanies.length;
  const urgentCount = filteredCompanies.filter((c) => c.signal === "overdue_invoices").length;
  const revenueAtRisk = filteredCompanies.reduce((s, c) => s + (c.revenue || 0), 0);

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
  });
  stateRef.current = {
    cmdkOpen, showHelp, selectedCompanyId, dashboard, variant, orderedCompanies, onboardingSubview,
  };

  // "g" prefix: press g, then [s|o|r|p|b] to jump dashboards (Gmail-style).
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

      // Esc — help → palette → go-prefix → detail back-out
      if (e.key === "Escape") {
        if (s.showHelp) { setShowHelp(false); return; }
        if (s.cmdkOpen) return;
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

      if (inInput || s.cmdkOpen) return;
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
        };
        const target = dashMap[k];
        if (target) {
          e.preventDefault();
          window.dispatchEvent(new Event("ud-dashboard-picker-close"));
          const dash = DASHBOARDS.find((d) => d.key === target);
          if (dash?.available) {
            setDashboard(target);
          } else {
            showToast(`${dash?.label ?? target} — coming soon`);
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
        if (e.key === "3") {
          e.preventDefault();
          setVariant("kanban");
          return;
        }
      }

      // Onboarding subviews: 1 = meeting prep, 2 = needs attention.
      if (s.dashboard === "onboarding" && !s.selectedCompanyId) {
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

      // Onboarding meeting prep — ← / → walks the day strip.
      if (
        s.dashboard === "onboarding" &&
        s.onboardingSubview === "meetings" &&
        !s.selectedCompanyId &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-onboarding-day-shift", {
            detail: e.key === "ArrowLeft" ? "prev" : "next",
          })
        );
        return;
      }

      // Onboarding meeting prep — ↑ / ↓ moves between meeting cards on the
      // selected day; Enter opens the focused card's deal.
      if (
        s.dashboard === "onboarding" &&
        s.onboardingSubview === "meetings" &&
        !s.selectedCompanyId &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ud-onboarding-meeting-nav", {
            detail: e.key === "ArrowUp" ? "prev" : "next",
          })
        );
        return;
      }
      if (
        s.dashboard === "onboarding" &&
        s.onboardingSubview === "meetings" &&
        !s.selectedCompanyId &&
        e.key === "Enter"
      ) {
        e.preventDefault();
        window.dispatchEvent(new Event("ud-onboarding-meeting-open"));
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

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showToast]);

  // Palette actions
  function handlePaletteAction(action: PaletteAction) {
    switch (action) {
      case "refresh":
        loadAttention();
        showToast("Refreshing…");
        return;
      case "open-company-in-hubspot":
        if (selectedCompanyId) {
          window.open(
            `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-2/${selectedCompanyId}`,
            "_blank",
            "noopener,noreferrer"
          );
        }
        return;
      case "open-deal-in-hubspot": {
        const dealId = companyData?.deal?.hs_object_id;
        if (dealId) {
          window.open(
            `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-3/${dealId}`,
            "_blank",
            "noopener,noreferrer"
          );
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
          onBack={back}
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
                  color: "#fff",
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
      if (variant === "split") {
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
      }
      return <KanbanView companies={filteredCompanies} onSelect={(c) => selectCompany(c.id)} />;
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
        />
        <VariantPicker
          variant={variant}
          setVariant={(v) => { setVariant(v); }}
          dashboard={dashboard}
          setDashboard={(d) => { setDashboard(d); }}
          totalCount={totalCount}
          urgentCount={urgentCount}
          revenueAtRisk={revenueAtRisk}
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

      <ShortcutCheatSheet isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--moss)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            zIndex: 200,
            boxShadow: "0 10px 30px rgba(2,44,18,0.3)",
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
