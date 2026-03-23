"use client";

import { useState, useEffect, useRef } from "react";
import { CompanySearchResult } from "@/lib/types";
import { getRecentCompanies, RecentCompany } from "@/lib/recent-companies";

interface Props {
  onSelect: (company: CompanySearchResult) => void;
  ref?: React.Ref<HTMLInputElement>;
}

export function SearchBar({ onSelect, ref }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [recents, setRecents] = useState<RecentCompany[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [cmdKLabel, setCmdKLabel] = useState("⌘K");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setRecents(getRecentCompanies());
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      setCmdKLabel(isMac ? "⌘K" : "Ctrl+K");
    }
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      // NOTE: intentionally do NOT touch showRecents here
      return;
    }

    setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowRecents(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleFocus() {
    setIsFocused(true);
    if (query === "") {
      setShowRecents(true);
    } else if (results.length > 0) {
      setIsOpen(true);
    }
  }

  function handleBlur() {
    setIsFocused(false);
  }

  // Filtered recents matching the current query
  const matchingRecents =
    query.length >= 2
      ? recents.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
      : [];

  // Total items in the current visible list for keyboard navigation
  const visibleItems: Array<{ type: "recent" | "result"; index: number }> = [];
  if (showRecents && query === "") {
    recents.slice(0, 5).forEach((_, i) => visibleItems.push({ type: "recent", index: i }));
  } else if (query.length >= 2) {
    matchingRecents.forEach((_, i) => visibleItems.push({ type: "recent", index: i }));
    results.forEach((_, i) => visibleItems.push({ type: "result", index: i }));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const isDropdownOpen = showRecents || isOpen;
    if (!isDropdownOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, visibleItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      const item = visibleItems[highlightIndex];
      if (!item) return;
      if (item.type === "recent") {
        const list = showRecents && query === "" ? recents.slice(0, 5) : matchingRecents;
        const recent = list[item.index];
        if (recent) handleSelect({ id: recent.id, name: recent.name, domain: "" });
      } else {
        handleSelect(results[item.index]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setShowRecents(false);
    }
  }

  function handleSelect(company: CompanySearchResult) {
    setQuery(company.name);
    setIsOpen(false);
    setShowRecents(false);
    onSelect(company);
  }

  const showDropdown = showRecents || isOpen;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          ref={ref}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search company..."
          className="w-full bg-white/15 text-white placeholder-white/50 rounded-[var(--border-radius)] px-4 py-2 pr-16 outline-none focus:bg-white/20 transition-all duration-200"
        />

        {/* Cmd+K badge — hidden when focused or has text */}
        {!isFocused && query === "" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 pointer-events-none select-none">
            {cmdKLabel}
          </span>
        )}

        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--light-grey)] rounded-[var(--border-radius)] shadow-[0_10px_64px_rgba(102,84,78,0.15)] overflow-hidden z-50">

          {/* Recent companies when query is empty */}
          {showRecents && query === "" && recents.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--green-100)]/60">
                Recent
              </div>
              {recents.slice(0, 5).map((company, index) => (
                <button
                  key={company.id}
                  onClick={() => handleSelect({ id: company.id, name: company.name, domain: "" })}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 border-t border-[var(--beige-gray)]/50 first:border-t-0 hover:bg-[var(--lichen)]/30 transition-all duration-200 ${
                    visibleItems[highlightIndex]?.type === "recent" &&
                    visibleItems[highlightIndex]?.index === index
                      ? "bg-[var(--lichen)]/30 border-l-2 border-l-[var(--moss)]"
                      : ""
                  }`}
                >
                  <span className="text-[var(--green-100)]/50 text-sm leading-none">&#x1F552;</span>
                  <span className="font-medium text-[var(--moss)]">{company.name}</span>
                </button>
              ))}
            </>
          )}

          {/* Empty recents state */}
          {showRecents && query === "" && recents.length === 0 && (
            <div className="px-4 py-3 text-[var(--green-100)] text-sm">No recent companies</div>
          )}

          {/* Query mode: matching recents above divider, then API results */}
          {query.length >= 2 && (
            <>
              {matchingRecents.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--green-100)]/60">
                    Recent
                  </div>
                  {matchingRecents.map((company, index) => (
                    <button
                      key={`recent-${company.id}`}
                      onClick={() =>
                        handleSelect({ id: company.id, name: company.name, domain: "" })
                      }
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 border-t border-[var(--beige-gray)]/50 first:border-t-0 hover:bg-[var(--lichen)]/30 transition-all duration-200 ${
                        visibleItems[highlightIndex]?.type === "recent" &&
                        visibleItems[highlightIndex]?.index === index
                          ? "bg-[var(--lichen)]/30 border-l-2 border-l-[var(--moss)]"
                          : ""
                      }`}
                    >
                      <span className="text-[var(--green-100)]/50 text-sm leading-none">
                        &#x1F552;
                      </span>
                      <span className="font-medium text-[var(--moss)]">{company.name}</span>
                    </button>
                  ))}
                  {results.length > 0 && (
                    <div className="border-t border-[var(--beige-gray)] mx-2 my-1" />
                  )}
                </>
              )}

              {isOpen && results.length === 0 && matchingRecents.length === 0 && (
                <div className="px-4 py-3 text-[var(--green-100)] text-sm">
                  No companies found
                </div>
              )}

              {results.map((company, index) => {
                const visibleIdx = matchingRecents.length + index;
                return (
                  <button
                    key={company.id}
                    onClick={() => handleSelect(company)}
                    className={`w-full text-left px-4 py-3 border-t border-[var(--beige-gray)]/50 first:border-t-0 hover:bg-[var(--lichen)]/30 transition-all duration-200 ${
                      highlightIndex === visibleIdx
                        ? "bg-[var(--lichen)]/30 border-l-2 border-l-[var(--moss)]"
                        : ""
                    }`}
                  >
                    <div className="font-medium text-[var(--moss)]">{company.name}</div>
                    {company.domain && (
                      <div className="text-xs text-[var(--green-100)]">{company.domain}</div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
