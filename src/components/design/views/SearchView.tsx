"use client";

import type { SearchResult, SearchTurn } from "@/lib/types";

// Pure presentation. Container owns query state + the chain; SearchView
// renders the input, refinement breadcrumb, examples, results list, loading
// states, and click-out paths. No fetches happen here.

interface SearchViewProps {
  query: string;
  setQuery: (q: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onRewindTo: (turnIdx: number) => void;
  /** True while the most-recent query is in flight. */
  loading: boolean;
  loadingPhase: "parse" | "execute" | null;
  /** Most-recent results to display. Empty array = no results / pre-search. */
  results: SearchResult[];
  /** Refinement chain (excluding the in-flight turn). When length > 0 we show
   *  breadcrumb chips above the input. */
  chain: SearchTurn[];
  /** Server-supplied error message, if any (LLM bail / validation / 5xx). */
  error: string | null;
  /** Click handler for a row that resolved to a company — page wiring opens
   *  the existing CompanyDetail panel. */
  onSelectCompany: (companyId: string) => void;
}

const EXAMPLE_CHIPS = [
  "All deals in my name that mention GYG in OB notes",
  "Companies in DK with health below 50",
  "Calls where we discussed seasonal pricing",
  "Pay-unwilling deals owned by Cecilia",
];

export function SearchView({
  query,
  setQuery,
  onSubmit,
  onReset,
  onRewindTo,
  loading,
  loadingPhase,
  results,
  chain,
  error,
  onSelectCompany,
}: SearchViewProps) {
  const hasChain = chain.length > 0;

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim() && !loading) onSubmit();
    }
  }

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
        padding: "32px 28px 60px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* HEADER LINE — same shape as Briefing/Onboarding morning bands */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            margin: "0 0 18px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--green-100)",
            }}
          >
            Search
          </span>
          <span aria-hidden="true" style={{ color: "var(--green-100)", opacity: 0.5 }}>·</span>
          <span
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 13,
              color: "var(--moss)",
            }}
          >
            Ask anything in plain English
          </span>
        </div>

        {/* REFINEMENT BREADCRUMB — clickable chips that rewind the chain */}
        {hasChain && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
              fontSize: 11,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--green-100)",
              }}
            >
              Refining
            </span>
            {chain.map((t, i) => (
              <button
                key={i}
                onClick={() => onRewindTo(i)}
                title="Rewind the chain to this turn"
                style={{
                  fontSize: 11,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "var(--lichen)",
                  border: "1px solid var(--hairline)",
                  color: "var(--moss)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t.query}
              </button>
            ))}
            <button
              onClick={onReset}
              title="Reset the chain"
              style={{
                marginLeft: "auto",
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                background: "transparent",
                border: "1px solid var(--hairline)",
                color: "var(--green-100)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Reset
            </button>
          </div>
        )}

        {/* INPUT */}
        <div
          style={{
            display: "flex",
            gap: 10,
            background: "var(--card-bg)",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            padding: "10px 14px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              hasChain
                ? "Refine — e.g. 'narrow to last month'"
                : "e.g. All deals in my name that mention GYG in OB notes"
            }
            disabled={loading}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--moss)",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={onSubmit}
            disabled={loading || !query.trim()}
            style={{
              padding: "7px 14px",
              borderRadius: 10,
              background: loading || !query.trim() ? "var(--beige-gray)" : "var(--moss)",
              color: "var(--text-on-moss)",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {/* EXAMPLES — only when chain is empty and we have no results yet */}
        {!hasChain && results.length === 0 && !loading && !error && (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
                fontSize: 12,
                color: "var(--green-100)",
                marginRight: 6,
              }}
            >
              try:
            </span>
            {EXAMPLE_CHIPS.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                }}
                style={{
                  fontSize: 11.5,
                  padding: "5px 11px",
                  borderRadius: 999,
                  background: "var(--card-bg)",
                  border: "1px solid var(--hairline)",
                  color: "var(--moss)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* LOADING STATE — two-phase skeleton */}
        {loading && (
          <div
            style={{
              marginTop: 22,
              fontSize: 12,
              color: "var(--green-100)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
            }}
          >
            {loadingPhase === "parse" ? "Parsing your query…" : "Searching HubSpot…"}
          </div>
        )}

        {/* ERROR */}
        {error && !loading && (
          <div
            style={{
              marginTop: 22,
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(184,74,45,0.08)",
              color: "var(--rust)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* RESULTS */}
        {!loading && !error && results.length > 0 && (
          <div
            style={{
              marginTop: 22,
              background: "var(--light-grey)",
              border: "1px solid var(--beige-gray)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                last={i === results.length - 1}
                onSelectCompany={onSelectCompany}
              />
            ))}
          </div>
        )}

        {/* EMPTY-AFTER-SEARCH */}
        {!loading && !error && hasChain && results.length === 0 && (
          <div
            style={{
              marginTop: 22,
              padding: 60,
              textAlign: "center",
              background: "var(--light-grey)",
              border: "1px dashed var(--beige-gray)",
              borderRadius: 16,
              color: "var(--green-100)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
              fontSize: 14,
            }}
          >
            No matches. Try rewinding the chain or rephrasing.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  result,
  last,
  onSelectCompany,
}: {
  result: SearchResult;
  last: boolean;
  onSelectCompany: (companyId: string) => void;
}) {
  const clickable = result.companyId !== null;
  const handleClick = () => {
    if (result.companyId) {
      onSelectCompany(result.companyId);
    } else {
      window.open(result.hubspotUrl, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <button
      onClick={handleClick}
      className="hrow"
      style={{
        display: "block",
        width: "100%",
        padding: "14px 18px",
        textAlign: "left",
        background: "transparent",
        borderBottom: last ? "none" : "1px solid var(--hairline)",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            color: "var(--moss)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {result.title}
        </span>
        <span style={{ fontSize: 11, color: "var(--green-100)", flexShrink: 0 }}>
          {result.subtitle}
        </span>
      </div>
      {result.snippets.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {result.snippets.map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 11.5,
                color: "var(--green-100)",
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--moss)",
                  marginRight: 6,
                  fontStyle: "normal",
                }}
              >
                {s.engagementType}
              </span>
              {s.excerpt}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
