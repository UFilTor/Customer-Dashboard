"use client";

// Hover/focus label for the glyph-only quick actions.
//
// The quick-action cluster is icon-only, so the label IS the affordance: a
// phone glyph doesn't say whether it dials, logs a call, or opens HubSpot,
// and it certainly doesn't say who it reaches. Native `title` technically
// carries that text but waits ~1s, can't be styled, and never shows on
// keyboard focus - so these controls get a real tooltip and drop their
// `title` (the same string stays on `aria-label` for screen readers).
//
// Rendered through a portal with position: fixed so it escapes the row's
// overflow and stacking context - portfolio rows clip their content, and an
// absolutely positioned tooltip would be cut off at the row edge.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Long enough that sweeping the cursor across the 7-button cluster doesn't
// strobe labels, short enough to feel like a direct answer.
const OPEN_DELAY_MS = 200;
const GAP = 8;
const EDGE_PADDING = 8;

type Placement = "top" | "bottom";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; placement: Placement } | null>(null);

  const close = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPos(null);
  }, []);

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip below when the trigger sits too close to the top of the viewport
    // (sticky toolbars, first row of a scrolled list).
    const placement: Placement = r.top < 44 ? "bottom" : "top";
    setPos({
      x: r.left + r.width / 2,
      y: placement === "top" ? r.top - GAP : r.bottom + GAP,
      placement,
    });
  }, []);

  const open = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      place();
    }, OPEN_DELAY_MS);
  }, [place]);

  // Any scroll or resize invalidates the measured position, and the pointer
  // has usually left the trigger by then anyway - cheaper to dismiss than to
  // track. Only bound while a tooltip is actually open.
  useEffect(() => {
    if (!pos) return;
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos, close]);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <span
      ref={wrapRef}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocusCapture={place}
      onBlurCapture={close}
      // The cluster's own click handlers already stop propagation; this only
      // makes sure a click dismisses the label instead of leaving it hanging
      // over the page while a new tab opens.
      onClickCapture={close}
      style={{ display: "inline-flex" }}
    >
      {children}
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform:
                pos.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
              // Clamp inside the viewport without measuring the label: the
              // max-width keeps a centered tooltip from reaching an edge on
              // any realistic column position.
              maxWidth: `min(260px, calc(100vw - ${EDGE_PADDING * 2}px))`,
              background: "var(--moss)",
              color: "var(--text-on-moss)",
              fontSize: 11.5,
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: "0.01em",
              padding: "5px 9px",
              borderRadius: 7,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: "0 4px 14px rgba(2, 44, 18, 0.18)",
              pointerEvents: "none",
              zIndex: 9999,
              animation: "ud-tooltip-in 110ms ease-out",
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
