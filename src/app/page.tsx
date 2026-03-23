"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { SearchBar } from "@/components/SearchBar";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricCards } from "@/components/MetricCards";
import { TabContainer } from "@/components/TabContainer";
import { OverviewTab } from "@/components/OverviewTab";
import { ActivityTab } from "@/components/ActivityTab";
import { TasksTab } from "@/components/TasksTab";
import { SkeletonCard, SkeletonBlock, SkeletonRecap } from "@/components/Skeleton";
import AuthGate from "@/components/AuthGate";
import { CompanySearchResult, CompanyDetail, OwnerMap, StageMap } from "@/lib/types";
import { AttentionList } from "@/components/AttentionList";
import { addRecentCompany, removeRecentCompany } from "@/lib/recent-companies";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";

interface CompanyData extends CompanyDetail {
  owners: OwnerMap;
  stages: StageMap;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const currentOwnerId = (session?.user as { hubspotOwnerId?: string } | undefined)?.hubspotOwnerId;
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigationSource, setNavigationSource] = useState<"attention" | "search" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [focusedAttentionIndex, setFocusedAttentionIndex] = useState(-1);
  const scrollPositionRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync focused item highlight via DOM
  useEffect(() => {
    const items = document.querySelectorAll("[data-attention-item]");
    items.forEach((el) => el.classList.remove("attention-item-focused"));
    if (focusedAttentionIndex >= 0 && focusedAttentionIndex < items.length) {
      const target = items[focusedAttentionIndex];
      target.classList.add("attention-item-focused");
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedAttentionIndex]);

  function handleBack() {
    setCompanyData(null);
    setSelectedCompanyId(null);
    setError(null);
    const pos = scrollPositionRef.current;
    setNavigationSource(null);
    requestAnimationFrame(() => window.scrollTo(0, pos));
  }

  async function fetchCompany(company: CompanySearchResult) {
    setIsLoading(true);
    setError(null);
    setSelectedCompanyId(company.id);
    setFocusedAttentionIndex(-1);
    try {
      const res = await fetch(`/api/companies/${company.id}`);
      if (!res.ok) throw new Error("Failed to load company data");
      const data = await res.json();
      setCompanyData(data);
      addRecentCompany({ id: company.id, name: company.name });
    } catch {
      setError("Could not load data. Please try again.");
      removeRecentCompany(company.id);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAttentionSelect(company: CompanySearchResult) {
    scrollPositionRef.current = window.scrollY;
    setNavigationSource("attention");
    fetchCompany(company);
  }

  function handleSearchSelect(company: CompanySearchResult) {
    setNavigationSource("search");
    fetchCompany(company);
  }

  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus();
    },
    onBack: () => {
      if (showHelp) {
        setShowHelp(false);
        return;
      }
      if (companyData) {
        handleBack();
      }
    },
    onNavigate: (direction) => {
      if (companyData) {
        // Up/Down switches tabs when viewing a company
        const tabButtons = document.querySelectorAll<HTMLButtonElement>("[class*='border-b'] > button");
        if (tabButtons.length === 0) return;
        const activeIndex = Array.from(tabButtons).findIndex((b) =>
          b.className.includes("font-semibold")
        );
        const nextIndex = direction === "down"
          ? Math.min(activeIndex + 1, tabButtons.length - 1)
          : Math.max(activeIndex - 1, 0);
        tabButtons[nextIndex]?.click();
        return;
      }
      const total = document.querySelectorAll("[data-attention-item]").length;
      if (total === 0) return;
      setFocusedAttentionIndex((prev) => {
        if (direction === "down") return Math.min(prev + 1, total - 1);
        return Math.max(prev - 1, 0);
      });
    },
    onSelect: () => {
      if (companyData) return;
      if (focusedAttentionIndex < 0) return;
      const items = document.querySelectorAll("[data-attention-item]");
      const target = items[focusedAttentionIndex] as HTMLElement | undefined;
      if (!target) return;
      const id = target.getAttribute("data-company-id");
      const name = target.getAttribute("data-company-name");
      if (id && name) {
        handleAttentionSelect({ id, name, domain: "" });
      }
    },
    onJumpToGroup: (index) => {
      if (companyData) return;
      const groups = document.querySelectorAll("[data-attention-group]");
      if (index >= groups.length) return;
      const group = groups[index];
      group.scrollIntoView({ behavior: "smooth", block: "start" });
      // Find the first attention item inside this group
      const firstItem = group.querySelector("[data-attention-item]");
      if (!firstItem) return;
      const allItems = Array.from(document.querySelectorAll("[data-attention-item]"));
      const itemIndex = allItems.indexOf(firstItem);
      if (itemIndex >= 0) setFocusedAttentionIndex(itemIndex);
    },
    onSwitchTab: (direction) => {
      if (!companyData) return;
      const tabButtons = document.querySelectorAll<HTMLButtonElement>("[class*='border-b'] > button");
      if (tabButtons.length === 0) return;
      const activeIndex = Array.from(tabButtons).findIndex((b) =>
        b.className.includes("font-semibold")
      );
      const nextIndex = direction === "next"
        ? Math.min(activeIndex + 1, tabButtons.length - 1)
        : Math.max(activeIndex - 1, 0);
      tabButtons[nextIndex]?.click();
    },
    onToggleHelp: () => setShowHelp((prev) => !prev),
  });

  return (
    <AuthGate>
      <div className="min-h-screen bg-[var(--beige-new)]">
        {/* Top bar */}
        <nav className="bg-[var(--moss)] px-6 py-3 grid grid-cols-3 items-center">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 justify-self-start hover:opacity-80 transition-opacity"
          >
            <img src="/understory-logo.png" alt="Understory" className="h-8 w-8 rounded" />
            <span className="text-white font-bold text-lg">Customer Dashboard</span>
          </button>
          <div className="justify-self-center w-full max-w-md">
            <SearchBar ref={searchInputRef} onSelect={handleSearchSelect} />
          </div>
          <div />
        </nav>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          {error && (
            <div className="bg-[var(--rust)]/10 border border-[var(--rust)]/20 rounded-[var(--border-radius)] p-4 mb-4 flex justify-between items-center">
              <span className="text-[var(--rust)] text-sm">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-[var(--rust)] text-sm underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!companyData && !isLoading && (
            <AttentionList onSelectCompany={handleAttentionSelect} currentOwnerId={currentOwnerId} />
          )}

          {isLoading && (
            <div>
              <div className="mb-4 animate-pulse">
                <div className="h-8 w-64 bg-[#e5e7eb] rounded mb-2" />
                <div className="h-4 w-96 bg-[#e5e7eb] rounded" />
              </div>
              <div className="grid grid-cols-5 gap-3 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonRecap />
              <div className="grid grid-cols-2 gap-4">
                <SkeletonBlock />
                <SkeletonBlock />
              </div>
            </div>
          )}

          {companyData && !isLoading && (
            <>
              <CompanyHeader
                companyId={selectedCompanyId!}
                company={companyData.company}
                deal={companyData.deal}
                owners={companyData.owners}
                showBack={navigationSource === "attention"}
                onBack={handleBack}
              />
              <MetricCards
                company={companyData.company}
                deal={companyData.deal}
              />
              <TabContainer
                tabs={[
                  {
                    id: "overview",
                    label: "Overview",
                    content: (
                      <OverviewTab
                        company={companyData.company}
                        deal={companyData.deal}
                        owners={companyData.owners}
                        stages={companyData.stages}
                        recap={companyData.recap}
                        companyId={selectedCompanyId!}
                      />
                    ),
                  },
                  {
                    id: "activity",
                    label: "Activity",
                    content: (
                      <ActivityTab
                        engagements={companyData.engagements}
                        owners={companyData.owners}
                      />
                    ),
                  },
                  {
                    id: "tasks",
                    label: "Tasks",
                    content: (
                      <TasksTab
                        tasks={companyData.tasks}
                        owners={companyData.owners}
                      />
                    ),
                  },
                ]}
              />
            </>
          )}
        </main>
      </div>

      <ShortcutCheatSheet isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </AuthGate>
  );
}
