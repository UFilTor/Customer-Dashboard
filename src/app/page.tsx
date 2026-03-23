"use client";

import { useState } from "react";
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

  function handleBack() {
    setCompanyData(null);
    setSelectedCompanyId(null);
    setError(null);
  }

  async function handleSelect(company: CompanySearchResult) {
    setIsLoading(true);
    setError(null);
    setSelectedCompanyId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}`);
      if (!res.ok) throw new Error("Failed to load company data");
      const data = await res.json();
      setCompanyData(data);
    } catch {
      setError("Could not load data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-[var(--beige-new)]">
        {/* Top bar */}
        <nav className="bg-[var(--moss)] px-6 py-3 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="text-white font-bold text-lg hover:text-[var(--citrus)] transition-all duration-200"
          >
            Customer Dashboard
          </button>
          <SearchBar onSelect={handleSelect} />
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
            <AttentionList onSelectCompany={handleSelect} currentOwnerId={currentOwnerId} />
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
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-[var(--green-100)] hover:text-[var(--moss)] transition-all duration-200 mb-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
                Back to overview
              </button>
              <CompanyHeader
                companyId={selectedCompanyId!}
                company={companyData.company}
                deal={companyData.deal}
                owners={companyData.owners}
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
    </AuthGate>
  );
}
