"use client";

import { useEffect, useCallback } from "react";

const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export interface ShortcutActions {
  onSearch: () => void;         // Cmd+K / Ctrl+K
  onBack: () => void;           // Esc
  onNavigate: (direction: "up" | "down") => void;  // Arrow keys
  onSelect: () => void;         // Enter
  onJumpToGroup: (index: number) => void;  // 1-4
  onToggleHelp: () => void;     // ?
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+K / Ctrl+K: always works, even in inputs
      if (modKey && e.key === "k") {
        e.preventDefault();
        actions.onSearch();
        return;
      }

      // Esc: priority chain - let focused inputs handle it first (e.g. SearchBar
      // closing its dropdown), then close modals, then blur inputs, then go back.
      if (e.key === "Escape") {
        if (isInputFocused()) {
          // Let the component's own handler deal with it (SearchBar closes dropdown).
          return;
        }
        actions.onBack();
        return;
      }

      // All remaining shortcuts are suppressed when input is focused
      if (isInputFocused()) return;

      // Arrow navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        actions.onNavigate("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        actions.onNavigate("up");
        return;
      }

      // Enter to open
      if (e.key === "Enter") {
        actions.onSelect();
        return;
      }

      // Number keys 1-4 to jump to group
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4) {
        actions.onJumpToGroup(num - 1); // 0-indexed
        return;
      }

      // ? for help
      if (e.key === "?") {
        actions.onToggleHelp();
        return;
      }
    },
    [actions]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}

export { isMac };
