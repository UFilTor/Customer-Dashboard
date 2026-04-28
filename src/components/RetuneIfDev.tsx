"use client";

import dynamic from "next/dynamic";

// Dev-only design overlay. We isolate the dynamic import in a client component
// so we can use `ssr: false` (forbidden in server components like layout.tsx).
// In production builds, the conditional below resolves to `null` at module
// eval, so the `retune` package is never bundled.
const Retune =
  process.env.NODE_ENV === "production"
    ? () => null
    : dynamic(() => import("retune").then((m) => m.Retune), { ssr: false });

export default function RetuneIfDev() {
  return <Retune />;
}
