export interface HealthTrend {
  direction: "improving" | "declining";
  previous: string;
}

function scoreToLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Monitor";
  if (score >= 40) return "At Risk";
  return "Critical Churn Risk";
}

export function getHealthTrend(
  current: string,
  previous: string | undefined
): HealthTrend | null {
  if (!previous || current === previous) return null;
  const currentNum = parseFloat(current);
  const previousNum = parseFloat(previous);
  if (isNaN(currentNum) || isNaN(previousNum)) return null;
  return {
    direction: currentNum > previousNum ? "improving" : "declining",
    previous,
  };
}

export function getHealthColor(score: string): { bg: string; text: string } {
  const num = parseFloat(score);
  if (isNaN(num)) return { bg: "#F3F4F6", text: "#374151" };
  if (num >= 80) return { bg: "#D1FAE5", text: "#065F46" };
  if (num >= 60) return { bg: "#FEF3C7", text: "#92400E" };
  if (num >= 40) return { bg: "#FED7AA", text: "#9A3412" };
  return { bg: "#FEE2E2", text: "#991B1B" };
}

export function getHealthLabel(score: string): string {
  const num = parseFloat(score);
  if (isNaN(num)) return score;
  return scoreToLabel(num);
}
