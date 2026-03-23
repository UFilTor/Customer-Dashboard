import { FormatType } from "@/lib/types";
import { formatValue } from "@/lib/format";

interface Props {
  value: string | null | undefined;
  format: FormatType;
  currencyCode?: string;
}

export function FieldRenderer({ value, format, currencyCode }: Props) {
  const formatted = formatValue(value, format, currencyCode);

  if (formatted === "-") {
    return <span className="text-[var(--green-100)]">-</span>;
  }

  switch (format) {
    case "link":
      return (
        <a
          href={`https://${formatted}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200"
        >
          {formatted}
        </a>
      );

    case "badge":
      return (
        <span className="inline-block bg-[var(--lichen)]/40 text-[var(--moss)] px-2 py-0.5 rounded-[8px] text-sm">
          {formatted}
        </span>
      );

    case "invoiceStatus": {
      const colorClass =
        formatted === "Overdue"
          ? "text-[var(--rust)]"
          : formatted === "Open"
          ? "text-orange-600"
          : "text-[var(--moss)]";
      return <span className={`font-semibold ${colorClass}`}>{formatted}</span>;
    }

    default:
      return <span className="text-[var(--moss)]">{formatted}</span>;
  }
}
