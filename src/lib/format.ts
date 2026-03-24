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
    case "invoiceStatus":
      if (value === "true") return "Overdue";
      if (value === "false" || value === "-") return "Up to date";
      return value;
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
