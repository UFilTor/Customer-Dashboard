"use client";

import { useEffect, useState } from "react";
import { LIVE_ANNOUNCE_EVENT } from "@/lib/live-announcer";

// Standard visually-hidden technique (not display:none / visibility:hidden —
// both remove the node from the accessibility tree, defeating the purpose).
const visuallyHiddenStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

// Mount once (page-client.tsx). Any component calls announce("...") from
// src/lib/live-announcer.ts; this renders the message into one shared
// aria-live="polite" region. Screen readers sometimes don't re-announce
// identical text back-to-back, so a trailing zero-width space alternates
// on every announcement to guarantee each one is distinct from the last.
export function LiveRegion() {
  const [message, setMessage] = useState("");
  const [parity, setParity] = useState(false);

  useEffect(() => {
    function onAnnounce(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail) return;
      setParity((p) => !p);
      setMessage(detail);
    }
    window.addEventListener(LIVE_ANNOUNCE_EVENT, onAnnounce);
    return () => window.removeEventListener(LIVE_ANNOUNCE_EVENT, onAnnounce);
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>
      {message}
      {parity ? "​" : ""}
    </div>
  );
}
