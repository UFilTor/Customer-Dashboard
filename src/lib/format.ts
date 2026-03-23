import { FormatType } from "./types";

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatValue(
  value: string | null | undefined,
  format: FormatType
): string {
  if (value === null || value === undefined || value === "") return "-";

  switch (format) {
    case "currency":
      return `${formatNumber(value)} kr`;
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
