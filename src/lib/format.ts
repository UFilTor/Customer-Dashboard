import { FormatType } from "./types";

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20ac",
  DKK: "DKK ",
  SEK: "SEK ",
  NOK: "NOK ",
  USD: "$",
  GBP: "\u00a3",
};

function getCurrencyPrefix(code?: string): string {
  if (!code) return "\u20ac";
  return CURRENCY_SYMBOLS[code.toUpperCase()] || `${code} `;
}

export function formatValue(
  value: string | null | undefined,
  format: FormatType,
  currencyCode?: string
): string {
  // Handle invoice status before the null check - null means no open invoices
  if (format === "invoiceStatus") {
    if (!value || value === "false" || value === "-" || value === "null") return "Up to date";
    if (value === "true") return "Overdue";
    return value;
  }

  if (value === null || value === undefined || value === "") return "-";

  switch (format) {
    case "currency":
      return `${getCurrencyPrefix(currencyCode)}${formatNumber(value)}`;
    case "number":
      return formatNumber(value);
    case "percentage": {
      const num = parseFloat(value);
      if (!isNaN(num) && Math.abs(num) < 1) {
        return `${(num * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
      }
      return `${value}%`;
    }
    case "date": {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString().split("T")[0];
    }
    case "text":
    case "link":
    case "badge":
    case "owner":
    case "revenue12m":
      return value;
    default:
      return value;
  }
}

export function abbreviateEur(value: number | undefined): string {
  if (!value) return "-";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  const formatted = m % 1 === 0 ? `${m}` : m.toFixed(1);
  return `€${formatted}M`;
}

export interface VolumeTrend {
  direction: "up" | "down" | "flat";
  percent: number;
}

export function computeVolumeTrend(
  volume3m: number | undefined,
  volume6m: number | undefined
): VolumeTrend | null {
  if (volume3m === undefined || volume6m === undefined) return null;
  const previous3m = volume6m - volume3m;
  if (previous3m <= 0) return null;
  const change = Math.round(((volume3m - previous3m) / previous3m) * 100);
  if (change === 0) return { direction: "flat", percent: 0 };
  return {
    direction: change > 0 ? "up" : "down",
    percent: Math.abs(change),
  };
}
