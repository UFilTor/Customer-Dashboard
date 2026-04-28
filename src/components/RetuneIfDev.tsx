"use client";

import dynamic from "next/dynamic";

// Dev-only design overlay. The retune package opens a websocket to a local
// bridge (localhost:9223) and pings /retune.manifest.json — both fail when
// the companion isn't running, flooding the dev console. We gate the mount
// behind NEXT_PUBLIC_RETUNE=true so the overlay is opt-in: set the env var
// when you actively want retune, leave it unset for a clean console.
//
// In production, the conditional resolves to () => null at module eval, so
// the `retune` package is tree-shaken out of the prod bundle entirely.
const isProd = process.env.NODE_ENV === "production";
const enabled = !isProd && process.env.NEXT_PUBLIC_RETUNE === "true";

const Retune = enabled
  ? dynamic(() => import("retune").then((m) => m.Retune), { ssr: false })
  : () => null;

export default function RetuneIfDev() {
  return <Retune />;
}
