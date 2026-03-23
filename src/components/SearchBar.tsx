"use client";

import { useState, useEffect, useRef } from "react";
import { CompanySearchResult } from "@/lib/types";

interface Props {
  onSelect: (company: CompanySearchResult) => void;
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
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
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handleSelect(company: CompanySearchResult) {
    setQuery(company.name);
    setIsOpen(false);
    onSelect(company);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search company..."
          className="w-full bg-white/15 text-white placeholder-white/50 rounded-[var(--border-radius)] px-4 py-2 outline-none focus:bg-white/20 transition-all duration-200"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--light-grey)] rounded-[var(--border-radius)] shadow-[0_10px_64px_rgba(102,84,78,0.15)] overflow-hidden z-50">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-[var(--green-100)] text-sm">No companies found</div>
          ) : (
            results.map((company, index) => (
              <button
                key={company.id}
                onClick={() => handleSelect(company)}
                className={`w-full text-left px-4 py-3 border-t border-[var(--beige-gray)]/50 first:border-t-0 hover:bg-[var(--lichen)]/30 transition-all duration-200 ${
                  index === highlightIndex ? "bg-[var(--lichen)]/30 border-l-2 border-l-[var(--moss)]" : ""
                }`}
              >
                <div className="font-medium text-[var(--moss)]">{company.name}</div>
                {company.domain && (
                  <div className="text-xs text-[var(--green-100)]">{company.domain}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
