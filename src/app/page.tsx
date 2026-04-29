import { buildAttentionPayload } from "@/lib/attention-payload";
import DashboardClient from "./page-client";

// Server Component — fetches the Status landing payload server-side so the
// first HTML response already carries the attention rows. The client
// component skips its first `/api/attention` fetch when this prop is
// non-null. On error (HubSpot down, missing token), pass null and let the
// client fall back to its normal fetch + error state.
//
// Edge runtime keeps the in-memory cache shared with the API route at
// `/api/attention` so cross-instance warming (cron + s-maxage) covers both.

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function Page() {
  let initialAttention = null;
  try {
    initialAttention = await buildAttentionPayload();
  } catch {
    // Fall through with null — the client will surface the friendly error
    // via its own `loadAttention` retry path.
  }
  return <DashboardClient initialAttention={initialAttention} />;
}
