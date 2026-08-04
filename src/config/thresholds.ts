import type { OnboardingStep } from "@/lib/types";

// Stage-duration thresholds and pacing cutoffs, consolidated from three
// near-identical maps that previously lived inline in onboarding.ts,
// portfolio.ts and meeting-prep.ts. Values agree wherever keys overlap;
// the three maps are kept separate because their KEY SETS differ by view:
// onboarding classifies via classifyStep (so it has "Other"), Portfolio
// reads customer_stage directly (so it has "Onboarding"), and the
// retention brief only tracks the two stages that pipeline uses.

// Expected days per onboarding step. Governs the Onboarding dashboard's
// stuck-deal detection and its low/medium/high risk banding.
export const EXPECTED_DAYS: Record<OnboardingStep, number> = {
  Adopted: 14,
  Started: 30,
  Hibernation: 30,
  "Product Hold": 14,
  Other: 30,
};

// Expected days per lifecycle-pipeline customer_stage. Governs the
// Portfolio view's "over expected duration" indicator.
export const PORTFOLIO_EXPECTED_DAYS: Record<string, number> = {
  Adopted: 14,
  Started: 30,
  Hibernation: 30,
  "Product Hold": 14,
  Onboarding: 14,
};

// Expected days per retention-pipeline stage. Governs the Meeting Prep
// brief's pacing line for retention deals.
export const RETENTION_EXPECTED_DAYS: Record<string, number> = {
  Adopted: 14,
  Started: 30,
};

// Fallback when a step has no entry in EXPECTED_DAYS.
export const DEFAULT_EXPECTED_DAYS = 30;

// Onboarding risk banding: daysInStep > expected is "medium" risk,
// daysInStep > expected * this multiplier is "high".
export const RISK_HIGH_MULTIPLIER = 1.5;

// Gone-quiet signal cutoffs (days since last outbound contact).
// Governs computeWatchOutSignals in src/lib/signals.ts: warn at 30+,
// bad at 45+.
export const GONE_QUIET_WARN_DAYS = 30;
export const GONE_QUIET_BAD_DAYS = 45;
