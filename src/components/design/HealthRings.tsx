import { memo } from "react";
import { fmtHealth } from "@/lib/format-design";
import { Chip } from "./Chip";

const HEALTH_COMPONENTS = [
  { key: "understory_health_score_actual_acv", label: "Volume" },
  { key: "understory_health_score_customer_storefront_visits", label: "Storefront" },
  { key: "understory_health_score_customer_widget_visits", label: "Widget" },
  { key: "understory_health_score_features_enabled", label: "Features" },
  { key: "understory_health_score_login_last_month", label: "Logins" },
  { key: "understory_health_score_transactions_diff", label: "Transactions" },
  { key: "understory_health_score_upcoming_events", label: "Events" },
];

interface RingProps {
  label: string;
  value: number; // 0-100
  size?: number;
}

function ScoreRing({ label, value, size = 64 }: RingProps) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c - (pct / 100) * c;
  const color = pct >= 65 ? "var(--status-good-bold)" : pct >= 40 ? "var(--status-warn-bold)" : "var(--rust)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--beige-gray)" strokeWidth={4} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s var(--ease-out)" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--moss)",
          }}
        >
          {pct}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--green-100)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Memoized for the same reason as VolumeChart — sits inside the meeting
// brief and re-renders on every parent change otherwise.
export const HealthRings = memo(function HealthRingsImpl({ company }: { company: Record<string, string> }) {
  const health = fmtHealth(company.health_score);
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-100)",
              marginBottom: 8,
            }}
          >
            Health breakdown
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 48,
                lineHeight: 0.9,
                color: "var(--moss)",
              }}
            >
              {health.num ?? "n/a"}
            </span>
            <Chip kind={health.tone}>{health.label}</Chip>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {HEALTH_COMPONENTS.map(({ key, label }) => {
          const raw = parseFloat(company[key] || "0");
          // Sub-scores are 0-1 ratios
          const pct = Math.round(raw * 100);
          return <ScoreRing key={key} label={label} value={pct} />;
        })}
      </div>
    </div>
  );
});
