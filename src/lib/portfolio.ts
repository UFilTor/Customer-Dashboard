import type { PortfolioStage, PortfolioSignalKey } from "./types";

// Maps HubSpot `customer_stage` to our 5-stage Portfolio union. Unknown
// values fall back to "Established" so the account still appears in the
// portfolio rather than being silently dropped.
export function classifyPortfolioStage(
  customerStage: string,
  _customerSubstage: string | null
): PortfolioStage {
  switch (customerStage) {
    case "Onboarding":
      return "Onboarding";
    case "Adopted":
      return "Adopted";
    case "Started":
      return "Started";
    case "Ramp Up":
      return "Ramp Up";
    case "Established":
      return "Established";
    default:
      return "Established";
  }
}

// Which signals can fire for each stage. A signal is dropped from a row if
// the row's stage is not in its applicability set.
export const STAGE_APPLICABILITY: Record<PortfolioSignalKey, PortfolioStage[]> = {
  overdue_invoices:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  open_invoices:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  no_future_events:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  health_dropped:    ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  gone_quiet:        ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  wish_to_churn:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  stuck_in_step:     ["Onboarding", "Adopted", "Started"],
  volume_declining:  ["Ramp Up", "Established"],
};

export function isSignalApplicable(signal: PortfolioSignalKey, stage: PortfolioStage): boolean {
  return STAGE_APPLICABILITY[signal].includes(stage);
}
