import { FormatType } from "@/lib/types";
import { formatValue } from "@/lib/format";

interface Props {
  value: string | null | undefined;
  format: FormatType;
}

export function FieldRenderer({ value, format }: Props) {
  const formatted = formatValue(value, format);

  if (formatted === "-") {
    return <span className="text-[#9ca3af]">-</span>;
  }

  switch (format) {
    case "link":
      return (
        <a
          href={`https://${formatted}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#022C12] underline hover:opacity-70"
        >
          {formatted}
        </a>
      );

    case "badge":
      return (
        <span className="inline-block bg-[#f0fdf4] text-[#022C12] px-2 py-0.5 rounded text-sm">
          {formatted}
        </span>
      );

    case "invoiceStatus": {
      const colorClass =
        formatted === "Overdue"
          ? "text-red-600"
          : formatted === "Open"
          ? "text-orange-500"
          : "text-green-600";
      return <span className={`font-semibold ${colorClass}`}>{formatted}</span>;
    }

    default:
      return <span>{formatted}</span>;
  }
}
