"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared ↑/↓/Enter keyboard navigation for full-page list views (Briefing,
 * By signal, Onboarding Needs Attention). Subscribes to the global
 * `ud-list-nav` and `ud-list-open` events dispatched by page.tsx.
 *
 * The focused item is highlighted via the `focusedIdx` return; consumers add
 * `data-list-idx={i}` to each rendered row inside the returned containerRef
 * so the hook can centre the row in the viewport on focus change.
 *
 * Mirrors the meeting-prep behaviour: first ↓ from null lands on index 0,
 * ↑ from index 0 (or null) clears focus and scrolls back to the top of the
 * page so the hero / day strip / banners are visible again.
 */
export function useListKeyboardNav<T>(items: T[], onOpen: (item: T) => void) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  const focusedRef = useRef(focusedIdx);
  const onOpenRef = useRef(onOpen);
  // Mirror the latest values so the once-attached listeners always read fresh
  // data without re-binding on every render.
  useEffect(() => {
    itemsRef.current = items;
    focusedRef.current = focusedIdx;
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    function onNav(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      const list = itemsRef.current;
      if (list.length === 0) return;
      const cur = focusedRef.current;

      if (dir === "next") {
        setFocusedIdx(cur === null ? 0 : Math.min(list.length - 1, cur + 1));
        return;
      }
      if (cur === null || cur === 0) {
        setFocusedIdx(null);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      setFocusedIdx(cur - 1);
    }
    function onOpenEvt() {
      const idx = focusedRef.current;
      if (idx === null) return;
      const item = itemsRef.current[idx];
      if (item) onOpenRef.current(item);
    }
    window.addEventListener("ud-list-nav", onNav);
    window.addEventListener("ud-list-open", onOpenEvt);
    return () => {
      window.removeEventListener("ud-list-nav", onNav);
      window.removeEventListener("ud-list-open", onOpenEvt);
    };
  }, []);

  // Filter changes that resize the list invalidate any held index. Resetting
  // on length-change is good enough — same-length swaps are rare. Uses
  // adjust-during-render (React's recommended alternative to a reset effect).
  const [prevLen, setPrevLen] = useState(items.length);
  if (prevLen !== items.length) {
    setPrevLen(items.length);
    setFocusedIdx(null);
  }

  // Centre the focused row in the viewport on every change.
  useEffect(() => {
    if (focusedIdx === null) return;
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-list-idx="${focusedIdx}"]`);
    if (target && typeof (target as HTMLElement).scrollIntoView === "function") {
      (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedIdx]);

  return { focusedIdx, setFocusedIdx, containerRef };
}
