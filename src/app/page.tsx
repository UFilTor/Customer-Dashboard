import DashboardClient from "./page-client";

// Server Component — a thin shell. It deliberately fetches nothing.
//
// This used to server-render the Status dashboard's attention payload so the
// first HTML already carried its rows. That stopped paying for itself when
// Portfolio replaced Status as the default: the payload is ~181 KB (about half
// the HTML response), takes ~4.5s to build cold, and is read by nothing except
// Status - which is now hidden from the dashboard picker. Every Portfolio load
// blocked on data it never used. page-client fetches it on arrival at
// ?d=status instead.

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return <DashboardClient />;
}
