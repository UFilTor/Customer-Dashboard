"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState, type CSSProperties } from "react";

// Top + bottom selectors share the same component and the same page state,
// so a user who scrolled to the end of a page never has to scroll back to
// the top to switch — the bottom selector mirrors the top one. Style follows
// the Filter / Sort pill pattern (card-bg, hairline border, 10px radius)
// so the toolbar reads as one consistent strip of chrome.
//
// The "Page X of Y" label is clickable: a single click swaps it for a
// numeric input so a user can jump straight to a page rather than chevron-
// stepping through 16 of them. Enter applies the typed page; Escape /
// blur cancels back to the label without changing the current page.
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select-all when entering edit mode so the user can immediately
  // type the target page without manually clearing the field.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed)) {
        const clamped = Math.max(1, Math.min(totalPages, parsed));
        if (clamped !== page) onPageChange(clamped);
      }
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  const navBtnStyle: CSSProperties = {
    background: "transparent",
    border: 0,
    fontFamily: "inherit",
    fontSize: 14,
    color: "var(--moss)",
    lineHeight: 1,
    padding: "0 4px",
    minWidth: 16,
  };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "var(--card-bg)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1,
        color: "var(--moss)",
      }}
    >
      <button
        type="button"
        aria-label="Previous page"
        aria-disabled={!canPrev}
        onClick={() => canPrev && onPageChange(page - 1)}
        style={{
          ...navBtnStyle,
          cursor: canPrev ? "pointer" : "default",
          // 0.45 keeps ≥3:1 against the cream pill background so a focus ring
          // landing on a disabled button still passes WCAG 1.4.11.
          opacity: canPrev ? 1 : 0.45,
        }}
      >
        ‹
      </button>
      {editing ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          <span>Page</span>
          <input
            ref={inputRef}
            // type=text + inputMode=numeric avoids the native number-input
            // spinner arrows (which can't be styled cleanly across browsers
            // and clash with the calm pill chrome). Validation happens in
            // commitDraft via parseInt + clamp.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            maxLength={String(totalPages).length}
            onChange={(e) => {
              // Strip non-digits so the field never accepts garbage.
              const cleaned = e.target.value.replace(/[^0-9]/g, "");
              setDraft(cleaned);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={commitDraft}
            aria-label={`Jump to page (1 to ${totalPages})`}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--moss)",
              background: "var(--page-bg)",
              border: "1px solid var(--hairline-strong)",
              borderRadius: 6,
              padding: "3px 8px",
              // Width fits the largest page number with breathing room.
              width: `${Math.max(36, String(totalPages).length * 8 + 20)}px`,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              outline: "none",
              lineHeight: 1.2,
            }}
          />
          <span>of {totalPages}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(String(page));
            setEditing(true);
          }}
          aria-label={`Page ${page} of ${totalPages}. Click to jump to a specific page.`}
          title="Jump to page"
          style={{
            background: "transparent",
            border: 0,
            fontFamily: "inherit",
            fontSize: 12,
            color: "var(--moss)",
            cursor: "pointer",
            padding: "2px 4px",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          Page <strong style={{ fontWeight: 600 }}>{page}</strong> of{" "}
          <strong style={{ fontWeight: 600 }}>{totalPages}</strong>
        </button>
      )}
      <button
        type="button"
        aria-label="Next page"
        aria-disabled={!canNext}
        onClick={() => canNext && onPageChange(page + 1)}
        style={{
          ...navBtnStyle,
          cursor: canNext ? "pointer" : "default",
          opacity: canNext ? 1 : 0.45,
        }}
      >
        ›
      </button>
    </div>
  );
}

// ---------- Section header (multi-signal grouping) ----------
