interface OwnerLike {
  name: string;
  color?: string;
}

interface AvatarProps {
  owner?: OwnerLike | null;
  size?: number;
}

// Owner avatar — first letter on a tinted disc.
export function Avatar({ owner, size = 22 }: AvatarProps) {
  const initial = owner?.name?.[0] ?? "?";
  const bg = owner?.color || (owner ? "var(--lichen)" : "#E5E3D8");
  const fg = owner ? "var(--moss)" : "var(--green-100)";
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: Math.max(9, size * 0.45),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}
