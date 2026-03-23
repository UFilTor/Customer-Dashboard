"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricCards } from "@/components/MetricCards";
import { TabContainer } from "@/components/TabContainer";
import { OverviewTab } from "@/components/OverviewTab";
import { ActivityTab } from "@/components/ActivityTab";
import { TasksTab } from "@/components/TasksTab";
import { SkeletonCard, SkeletonBlock } from "@/components/Skeleton";
import AuthGate from "@/components/AuthGate";
import { CompanySearchResult, CompanyDetail, OwnerMap, StageMap } from "@/lib/types";

interface CompanyData extends CompanyDetail {
  owners: OwnerMap;
  stages: StageMap;
}

export default function Dashboard() {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="min-h-screen bg-white">
        {/* Top bar */}
        <nav className="bg-[#022C12] px-6 py-3 flex items-center justify-between">
          <span className="text-white font-bold text-lg">Customer Dashboard</span>
          <SearchBar onSelect={handleSelect} />
        </nav>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex justify-between items-center">
              <span className="text-red-700 text-sm">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-700 text-sm underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!companyData && !isLoading && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <p className="text-[#9ca3af] text-lg">Search for a company to get started</p>
            </div>
          )}

          {isLoading && (
            <div>
              <div className="mb-4 animate-pulse">
                <div className="h-8 w-64 bg-[#e5e7eb] rounded mb-2" />
                <div className="h-4 w-96 bg-[#e5e7eb] rounded" />
              </div>
              <div className="grid grid-cols-4 gap-3 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
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
