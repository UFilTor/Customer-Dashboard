const CATEGORY_ORDER = ["Healthy", "Monitor", "At Risk", "Critical Churn Risk"];

export interface HealthTrend {
  direction: "improving" | "declining";
  previous: string;
}

export function getHealthTrend(
  current: string,
  previous: string | undefined
): HealthTrend | null {
  if (!previous || current === previous) return null;
  const currentIndex = CATEGORY_ORDER.indexOf(current);
  const previousIndex = CATEGORY_ORDER.indexOf(previous);
  if (currentIndex === -1 || previousIndex === -1) return null;
  return {
    direction: currentIndex < previousIndex ? "improving" : "declining",
    previous,
  };
}

export function getHealthColor(category: string): { bg: string; text: string } {
  switch (category) {
    case "Healthy":
      return { bg: "#D1FAE5", text: "#065F46" };
    case "Monitor":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "At Risk":
      return { bg: "#FED7AA", text: "#9A3412" };
    case "Critical Churn Risk":
      return { bg: "#FEE2E2", text: "#991B1B" };
    default:
      return { bg: "#F3F4F6", text: "#374151" };
  }
}
