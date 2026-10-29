"use client";

import { createContext, useContext, useEffect, useRef } from "react";

// Every dashboard the user has visited stays mounted, hidden with
// `display: none` while another one is in front, so its state (scroll, sort,
// expanded lists, search results) survives a switch or a company-detail
// round-trip. See AGENTS.md "Dashboard container lifecycle".
//
// - visible: this dashboard is the selected one (a company detail may still
//   cover it).
// - active: visible AND no detail covers it, i.e. the user is looking at it.
//
// Window-level listeners inside a dashboard must check these, or a hidden
// dashboard reacts to keys and refreshes meant for the one in front. The
// default (both true) keeps components rendered outside a slot working as
// before.
export interface DashboardSlotState {
  visible: boolean;
  active: boolean;
}

export const DashboardSlotContext = createContext<DashboardSlotState>({
  visible: true,
  active: true,
});

export function useDashboardSlot(): DashboardSlotState {
  return useContext(DashboardSlotContext);
}

// Quiet refetch when the user comes back to a dashboard that sat hidden, so
// its data is as fresh as a remount would have made it while the UI state
// stays put. Callers pass their non-forcing fetch (no ?refresh), so inside the
// server's 15-min cache window this is a cache hit, not a HubSpot rebuild.
export function useRefetchOnReturn(fetchData: () => void) {
  const { visible } = useDashboardSlot();
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) fetchData();
    wasVisibleRef.current = visible;
  }, [visible, fetchData]);
}
