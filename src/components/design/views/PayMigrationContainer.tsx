"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayMigrationData, PayDeal, CompanySearchResult } from "@/lib/types";
import { PayMigrationView } from "./PayMigrationView";

interface Props {
  payFilter: string;
  onSelectCompany: (c: CompanySearchResult) => void;
}

export function PayMigrationContainer({ payFilter, onSelectCompany }: Props) {
  const [data, setData] = useState<PayMigrationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    if (!data) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const url = refresh ? "/api/pay-migration?refresh=true" : "/api/pay-migration";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load Pay migration data");
      const json: PayMigrationData = await res.json();
      setData(json);
    } catch {
      setError("Could not load Pay migration data. Try refreshing.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [data]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDealClick(deal: PayDeal) {
    // PayDeal carries the HubSpot companyId when available; fall back to a name search.
    if (deal.companyId) {
      onSelectCompany({ id: deal.companyId, name: deal.dealName, domain: "" });
      return;
    }
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(deal.dealName)}`);
      if (!res.ok) return;
      const results: CompanySearchResult[] = await res.json();
      if (results.length > 0) onSelectCompany(results[0]);
    } catch {/* noop */}
  }

  if (isLoading) {
    return (
      <div
        className="animate-pulse"
        style={{ background: "var(--beige-new)", minHeight: "calc(100vh - 120px)", padding: "32px 28px" }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ height: 60, width: "40%", background: "var(--hairline)", borderRadius: 8, marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 32 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 96, background: "var(--hairline)", borderRadius: 10 }} />
            ))}
          </div>
          <div style={{ height: 120, background: "var(--hairline)", borderRadius: 10, marginBottom: 32 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 280, background: "var(--hairline)", borderRadius: 10 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          background: "var(--beige-new)",
          minHeight: "calc(100vh - 120px)",
          padding: "60px 28px",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--rust)", marginBottom: 12 }}>{error || "No data."}</p>
        <button
          onClick={() => fetchData(true)}
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
    );
  }

  return (
    <PayMigrationView
      data={data}
      payFilter={payFilter}
      isRefreshing={isRefreshing}
      onRefresh={() => fetchData(true)}
      onDealClick={handleDealClick}
    />
  );
}
