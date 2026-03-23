"use client";

import { useState, useEffect } from "react";
import { AttentionGroup as AttentionGroupComponent } from "./AttentionGroup";
import { AttentionResponse, CompanySearchResult } from "@/lib/types";

interface Props {
  onSelectCompany: (company: CompanySearchResult) => void;
}

export function AttentionList({ onSelectCompany }: Props) {
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAttention(refresh = false) {
    setIsLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/attention?refresh=true" : "/api/attention";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load attention data. Try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchAttention();
  }, []);

  function formatUpdatedAt(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Updated just now";
    if (minutes === 1) return "Updated 1 minute ago";
    return `Updated ${minutes} minutes ago`;
  }

  if (isLoading) {
    return <SkeletonAttentionInline />;
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--rust)] text-sm mb-2">{error}</p>
        <button
          onClick={() => fetchAttention(true)}
          className="text-sm text-[var(--moss)] font-semibold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--moss)] text-lg font-medium">All clear</p>
        <p className="text-[var(--green-100)] text-sm mt-1">No customers need immediate attention.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
          <p className="text-xs text-[var(--green-100)] mt-1">
            {formatUpdatedAt(data.updatedAt)}
          </p>
        </div>
        <button
          onClick={() => fetchAttention(true)}
          className="text-sm text-[var(--moss)] hover:text-[var(--green-100)] transition-all duration-200"
          title="Refresh"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>

      {data.groups.map((group) => (
        <AttentionGroupComponent
          key={group.signal}
          group={group}
          onSelectCompany={onSelectCompany}
        />
      ))}
    </div>
  );
}

function SkeletonAttentionInline() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-40 bg-[var(--beige-gray)] rounded mb-2" />
      <div className="h-3 w-32 bg-[var(--beige-gray)] rounded mb-6" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6">
          <div className="h-5 w-36 bg-[var(--beige-gray)] rounded mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-12 bg-[var(--light-grey)] rounded-[var(--border-radius)]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
