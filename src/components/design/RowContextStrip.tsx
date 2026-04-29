import { relDays } from "@/lib/format-design";

// Small "context strip" rendered under the company name + detail line on
// Briefing/Split rows. Surfaces three pieces of triage context that today
// only live in the company-detail panel:
//
//   Live on Pay · Starter · 8d since contact
//
// Renders nothing when all three values are missing so empty rows stay
// dense. Each segment is omitted independently — no "—" placeholders.

const PAY_STATUS_LABELS: Record<string, string> = {
  Live: "Live on Pay",
  Verified: "Verified",
  "Pending Verification": "Pending verification",
  "Started Onboarding": "Pay onboarding",
  "Signed - Not Started": "Signed (not started)",
  "Not yet enrolled": "Not enrolled",
  Unwilling: "Pay unwilling",
  Ineligible: "Pay ineligible",
};

function payStatusLabel(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return PAY_STATUS_LABELS[trimmed] ?? trimmed;
}

export function RowContextStrip({
  payStatus,
  plan,
  lastContactedAt,
}: {
  payStatus?: string;
  plan?: string;
  lastContactedAt?: string;
}) {
  const pay = payStatusLabel(payStatus);
  const planLabel = plan?.trim() || null;
  const last = lastContactedAt ? relDays(lastContactedAt) : null;
  // relDays returns "today" / "yesterday" / "5d ago" / "Xmo ago" / "YYYY-MM-DD"
  // (for >365 days). Pad each shape so the meaning is unambiguous in a sea
  // of numbers.
  const lastLabel = last
    ? /^\d{4}-\d{2}-\d{2}$/.test(last)
      ? `Last contacted ${last}`
      : /^\d/.test(last)
        ? `${last} since contact`
        : `Contacted ${last}`
    : null;

  const parts = [pay, planLabel, lastLabel].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--green-100)",
        marginTop: 4,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 6,
        rowGap: 2,
      }}
    >
      {pay && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {payStatus === "Live" && (
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--citrus)",
                display: "inline-block",
              }}
            />
          )}
          {pay}
        </span>
      )}
      {pay && (planLabel || lastLabel) && <span style={{ opacity: 0.5 }} aria-hidden="true">·</span>}
      {planLabel && <span>{planLabel}</span>}
      {planLabel && lastLabel && <span style={{ opacity: 0.5 }} aria-hidden="true">·</span>}
      {lastLabel && <span>{lastLabel}</span>}
    </div>
  );
}
