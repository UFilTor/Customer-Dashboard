"use client";

// Free-text account filter for the Portfolio toolbar. Collapsed it is a single
// magnifier glyph sized like its neighbouring pills; clicking (or pressing /)
// grows it into a field. Rendered once inside Toolbar, so table and board get
// the same control with no duplication.
//
// The term itself lives in page-client (URL param `q`), not here - it has to
// survive both a table/board flip and the container unmount that opening a
// company detail causes. This component owns nothing but "is the field
// showing", and even that is derived from the term whenever one exists.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Tooltip } from "../../Tooltip";
import { pillTriggerStyle } from "./chrome";

export function SearchPill({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (q: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived, not synced: a non-empty term arriving from the URL (deep link, or
  // back-navigation out of a company detail) renders the field open on the
  // first paint with no effect and no prevX slot to keep convergent.
  const open = expanded || search !== "";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // `/` from the row list opens and focuses. Dispatched by page-client's single
  // capture-phase handler, which sits below its own inInput guard - so this
  // cannot fire while the user is already typing in here.
  useEffect(() => {
    function onFocusRequest() {
      setExpanded(true);
      inputRef.current?.focus();
    }
    window.addEventListener("ud-portfolio-search-focus", onFocusRequest);
    return () => window.removeEventListener("ud-portfolio-search-focus", onFocusRequest);
  }, []);

  const close = () => {
    onSearchChange("");
    setExpanded(false);
  };

  if (!open) {
    return (
      <Tooltip label="Search accounts by name or domain">
        <button
          onClick={() => setExpanded(true)}
          aria-label="Search accounts by name or domain"
          aria-expanded={false}
          style={{ ...pillTriggerStyle(false), gap: 8, padding: "8px 11px", alignSelf: "stretch" }}
        >
          <Icon.Search size={14} />
          <span className="kbd">/</span>
        </button>
      </Tooltip>
    );
  }

  return (
    <div
      style={{
        ...pillTriggerStyle(search !== ""),
        gap: 8,
        padding: "8px 11px",
        width: 240,
        cursor: "text",
        // The neighbouring pills are ~3px taller than this box's own content
        // (their kbd-hint chip sets their height). Stretching to the flex
        // line's cross-size matches them without hardcoding a number that
        // would silently drift if that chip's styling ever changes.
        alignSelf: "stretch",
        // No width transition here. The collapsed state is a <button> and this
        // is a <div>, so React swaps the node rather than resizing one - a
        // width animation would be dead code. Animating it for real would mean
        // one persistent element whose growth reflows the three sibling pills
        // on every frame, which is the layout thrash worth avoiding. The pill
        // is click-to-focus, so an instant expand reads fine; pillTriggerStyle
        // still supplies the border-color transition for the filled state.
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <Icon.Search size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        // Escape clears and collapses. page-client's capture-phase Escape
        // handler runs first but only returns when nothing else is open, so
        // the key still reaches this input.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        // Collapse only when the user leaves an empty field - a term still in
        // the box keeps the field visible, since it is the only on-screen
        // explanation for why the list is short.
        onBlur={() => {
          if (search === "") setExpanded(false);
        }}
        placeholder="Search name or domain"
        aria-label="Search accounts by name or domain"
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: "none",
          background: "transparent",
          color: "var(--moss)",
          fontSize: 12,
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      />
      {search !== "" && (
        <button
          onClick={close}
          aria-label="Clear search"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            border: 0,
            padding: 0,
            background: "transparent",
            color: "var(--green-100)",
            cursor: "pointer",
          }}
        >
          <Icon.X size={13} />
        </button>
      )}
    </div>
  );
}
