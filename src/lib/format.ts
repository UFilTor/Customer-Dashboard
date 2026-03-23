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
  if (value === null || value === undefined || value === "") return "-";

  switch (format) {
    case "currency":
      return `${getCurrencyPrefix(currencyCode)}${formatNumber(value)}`;
    case "number":
      return formatNumber(value);
    case "percentage":
      return `${value}%`;
    case "date": {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString().split("T")[0];
    }
    case "text":
    case "link":
    case "badge":
    case "owner":
    case "invoiceStatus":
      return value;
    default:
      return value;
  }
}
