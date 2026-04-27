import type { ReactNode } from "react";
import { fmtHealth } from "@/lib/format-design";

type ChipKind = "muted" | "moss" | "rust" | "good" | "warn" | "bad" | "accent";

interface ChipProps {
  kind?: ChipKind;
  dotColor?: string;
  children: ReactNode;
}

const KIND_STYLES: Record<ChipKind, { bg: string; color: string }> = {
  muted: { bg: "#F3F2ED", color: "var(--green-100)" },
  moss: { bg: "rgba(2,44,18,0.06)", color: "var(--moss)" },
  rust: { bg: "rgba(147,63,41,0.10)", color: "var(--rust)" },
  good: { bg: "var(--status-good-bg)", color: "var(--status-good-fg)" },
  warn: { bg: "var(--status-warn-bg)", color: "var(--status-warn-fg)" },
  bad: { bg: "rgba(147,63,41,0.10)", color: "var(--rust)" },
  accent: { bg: "var(--citrus)", color: "var(--moss)" },
};

export function Chip({ kind = "muted", dotColor, children }: ChipProps) {
  const s = KIND_STYLES[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 7px",
        borderRadius: 6,
        fontSize: 10.5,
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
      }}
    >
      {dotColor && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

export function HealthChip({ score }: { score: string | number | null | undefined }) {
  const { label, num, tone } = fmtHealth(score);
  if (num == null) return <Chip kind="muted">No score</Chip>;
  const dotColor =
    tone === "bad" ? "var(--rust)" :
    tone === "warn" ? "var(--status-warn-bold)" :
    tone === "good" ? "var(--status-good-bold)" : "var(--green-100)";
  return (
    <Chip kind={tone} dotColor={dotColor}>
      {label} · {num}
    </Chip>
  );
}
