"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "./Icon";
import {
  OWNERS,
  OWNER_MAP,
  REGIONS,
  type GlobalFilter,
  type RegionKey,
} from "@/lib/owners";
import { DashboardPicker, type DashboardKey } from "./VariantPicker";

interface TopBarProps {
  filter: GlobalFilter;
  setFilter: (f: GlobalFilter) => void;
  isDefault: boolean;
  setAsDefault: () => void;
  clearDefault: () => void;
  onOpenCmdk: () => void;
  showBack: boolean;
  onBack: () => void;
  dashboard: DashboardKey;
  setDashboard: (d: DashboardKey) => void;
}

export function TopBar({
  filter,
  setFilter,
  isDefault,
  setAsDefault,
  clearDefault,
  onOpenCmdk,
  showBack,
  onBack,
  dashboard,
  setDashboard,
}: TopBarProps) {
  // Default to ⌘K so the SSR markup matches the most common case (Mac).
  // On non-Mac clients the label swaps to "Ctrl+K" after hydration.
  const [cmdLabel] = useState(() => {
    if (typeof navigator === "undefined") return "⌘K";
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘K" : "Ctrl+K";
  });

  return (
    <nav className="topbar-nav">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.02em",
          }}
        >
          <Image
            src="/understory-logo.png"
            alt="Understory"
            width={26}
            height={26}
            style={{ borderRadius: 6 }}
            priority
          />
          <span>Understory</span>
        </div>
        {showBack && (
          <button onClick={onBack} title="Back" style={pillStyle(false)}>
            <Icon.ArrowLeft />
            <span>Back</span>
          </button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          onClick={onOpenCmdk}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.72)",
            padding: "7px 12px",
            borderRadius: 10,
            fontSize: 13,
            minWidth: 360,
            cursor: "pointer",
            transition: "background 160ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.72)"; }}
        >
          <Icon.Search />
          <span>Search companies, run commands…</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "rgba(255,255,255,0.10)",
              padding: "2px 6px",
              borderRadius: 4,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {cmdLabel}
          </span>
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FilterTypePill
          filter={filter}
          setFilter={setFilter}
          isDefault={isDefault}
          setAsDefault={setAsDefault}
          clearDefault={clearDefault}
        />
        {filter.kind !== "all" && (
          <FilterValuePill
            filter={filter}
            setFilter={setFilter}
            isDefault={isDefault}
            setAsDefault={setAsDefault}
            clearDefault={clearDefault}
          />
        )}
        <span aria-hidden="true" style={{ width: 1, height: 20, background: "rgba(255,255,255,0.18)" }} />
        <DashboardPicker dashboard={dashboard} setDashboard={setDashboard} />
      </div>
    </nav>
  );
}

function pillStyle(highlighted: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 14px",
    borderRadius: 10,
    background: highlighted ? "rgba(241,249,126,0.12)" : "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    border: highlighted ? "1px solid var(--citrus)" : "1px solid transparent",
    cursor: "pointer",
    transition: "background 0.15s",
  };
}

interface PillProps {
  filter: GlobalFilter;
  setFilter: (f: GlobalFilter) => void;
  isDefault: boolean;
  setAsDefault: () => void;
  clearDefault: () => void;
}

function useDropdownDismiss(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);
  return ref;
}

const TYPE_OPTIONS = ["all", "region", "person"] as const;

function FilterTypePill({ filter, setFilter, isDefault, setAsDefault, clearDefault }: PillProps) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const ref = useDropdownDismiss(open, setOpen);

  const label = filter.kind === "all" ? "All" : filter.kind === "region" ? "Region" : "Person";
  const isFiltered = filter.kind !== "all";

  // Broadcast open state so page.tsx knows to suppress its own keyboard
  // shortcuts while a pill dropdown is up.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-filter-pill-state", { detail: open })
    );
  }, [open]);

  // External open trigger (F key) and global close. Initial focus lands on
  // whichever option matches the active filter so the user can step away
  // from it without an extra keypress.
  useEffect(() => {
    function onOpenEvt() {
      setOpen(true);
    }
    function onCloseAll() { setOpen(false); }
    window.addEventListener("ud-filter-type-open", onOpenEvt);
    window.addEventListener("ud-filter-close-all", onCloseAll);
    return () => {
      window.removeEventListener("ud-filter-type-open", onOpenEvt);
      window.removeEventListener("ud-filter-close-all", onCloseAll);
    };
  }, []);

  // Sync focus to the active option whenever the dropdown opens.
  useEffect(() => {
    if (!open) return;
    const i = TYPE_OPTIONS.indexOf(filter.kind);
    setFocusedIdx(i >= 0 ? i : 0);
  }, [open, filter.kind]);

  // Keyboard navigation while the dropdown is open. The ref mirrors
  // focusedIdx so the once-attached keydown listener always reads the
  // latest selection without re-binding on every change.
  const focusedRef = useRef(focusedIdx);
  useEffect(() => {
    focusedRef.current = focusedIdx;
  });
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(TYPE_OPTIONS.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        pickType(TYPE_OPTIONS[focusedRef.current]);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pickType(kind: "all" | "region" | "person") {
    if (kind === "all") setFilter({ kind: "all" });
    else if (kind === "region") {
      // Default to the user's current region if already filtering by region, else first region.
      const region: RegionKey = filter.kind === "region" ? filter.region : "DK";
      setFilter({ kind: "region", region });
    } else {
      const ownerId = filter.kind === "person" ? filter.ownerId : OWNERS[0].id;
      setFilter({ kind: "person", ownerId });
    }
    setOpen(false);
    // Chain to the value pill if there's a value to pick.
    if (kind !== "all") {
      // Defer so the value pill mounts (it's conditional on filter.kind != "all").
      setTimeout(() => {
        window.dispatchEvent(new Event("ud-filter-value-open"));
      }, 30);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title={`Filter type: ${label}`} style={pillStyle(isFiltered)}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Filter
        </span>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <Caret open={open} />
      </button>

      {open && (
        <Dropdown header="Filter scope" sub="Applies across every dashboard">
          <DropdownOption
            label="All accounts"
            sub="No filter applied"
            icon="★"
            active={filter.kind === "all"}
            focused={focusedIdx === 0}
            onClick={() => pickType("all")}
          />
          <DropdownOption
            label="Region"
            sub="Group by country"
            icon="◎"
            active={filter.kind === "region"}
            focused={focusedIdx === 1}
            onClick={() => pickType("region")}
          />
          <DropdownOption
            label="Person"
            sub="Filter by individual owner"
            icon="●"
            active={filter.kind === "person"}
            focused={focusedIdx === 2}
            onClick={() => pickType("person")}
          />
          <DefaultPinFooter
            isDefault={isDefault}
            setAsDefault={setAsDefault}
            clearDefault={clearDefault}
          />
        </Dropdown>
      )}
    </div>
  );
}

function FilterValuePill({ filter, setFilter, isDefault, setAsDefault, clearDefault }: PillProps) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const ref = useDropdownDismiss(open, setOpen);

  // Broadcast open state so page.tsx can suppress its own shortcuts.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-filter-pill-state", { detail: open })
    );
  }, [open]);

  // External open trigger (chain from kind pill) and global close.
  useEffect(() => {
    function onOpenEvt() { setOpen(true); }
    function onCloseAll() { setOpen(false); }
    window.addEventListener("ud-filter-value-open", onOpenEvt);
    window.addEventListener("ud-filter-close-all", onCloseAll);
    return () => {
      window.removeEventListener("ud-filter-value-open", onOpenEvt);
      window.removeEventListener("ud-filter-close-all", onCloseAll);
    };
  }, []);

  // Number of visible options depends on the kind. Computed lazily inside the
  // keyboard effect so we don't break hooks order on filter.kind changes.
  const optionsLength = filter.kind === "region" ? REGIONS.length : filter.kind === "person" ? OWNERS.length : 0;

  // Sync focus to active option on open. Adjust-during-render (using a
  // composite key of open + filter identity) avoids a setState-in-effect.
  const syncKey = open
    ? filter.kind === "region"
      ? `r:${filter.region}`
      : filter.kind === "person"
        ? `p:${filter.ownerId}`
        : "all"
    : null;
  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    if (open) {
      if (filter.kind === "region") {
        const i = REGIONS.findIndex((r) => r.key === filter.region);
        setFocusedIdx(i >= 0 ? i : 0);
      } else if (filter.kind === "person") {
        const i = OWNERS.findIndex((o) => o.id === filter.ownerId);
        setFocusedIdx(i >= 0 ? i : 0);
      } else {
        setFocusedIdx(0);
      }
    }
  }

  // Keyboard nav while the dropdown is open. Refs mirror focusedIdx +
  // filter so the once-attached keydown listener reads fresh values.
  const focusedRef = useRef(focusedIdx);
  const filterRef = useRef(filter);
  useEffect(() => {
    focusedRef.current = focusedIdx;
    filterRef.current = filter;
  });
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(optionsLength - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const f = filterRef.current;
        const idx = focusedRef.current;
        if (f.kind === "region" && REGIONS[idx]) {
          setFilter({ kind: "region", region: REGIONS[idx].key });
        } else if (f.kind === "person" && OWNERS[idx]) {
          setFilter({ kind: "person", ownerId: OWNERS[idx].id });
        }
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, optionsLength, setFilter]);

  // Memoised display values for the pill. The "all" case is filtered out by
  // the parent before this component renders, but we still narrow defensively.
  if (filter.kind === "all") return null;

  if (filter.kind === "region") {
    const r = REGIONS.find((x) => x.key === filter.region);
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} title={`Region: ${r?.label || filter.region}`} style={pillStyle(true)}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "var(--citrus)",
              color: "var(--moss)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {filter.region}
          </span>
          <span>{r?.label || filter.region}</span>
          <Caret open={open} />
        </button>

        {open && (
          <Dropdown header="Region" sub="Filter dashboards by country">
            {REGIONS.map((opt, i) => (
              <DropdownOption
                key={opt.key}
                label={opt.label}
                sub={opt.key}
                icon={opt.key}
                active={filter.region === opt.key}
                focused={focusedIdx === i}
                onClick={() => {
                  setFilter({ kind: "region", region: opt.key });
                  setOpen(false);
                }}
              />
            ))}
            <DefaultPinFooter
              isDefault={isDefault}
              setAsDefault={setAsDefault}
              clearDefault={clearDefault}
            />
          </Dropdown>
        )}
      </div>
    );
  }

  // person
  const owner = OWNER_MAP[filter.ownerId];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={owner ? `Viewing as ${owner.name}` : "Pick a person"}
        style={pillStyle(true)}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: owner?.color || "var(--citrus)",
            color: "var(--moss)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {owner ? owner.name[0] : "?"}
        </span>
        <span>{owner?.name || "Pick"}</span>
        <Caret open={open} />
      </button>

      {open && (
        <Dropdown header="Person" sub="Filter dashboards by owner">
          {OWNERS.map((o, i) => (
            <DropdownOption
              key={o.id}
              label={o.name}
              sub={o.region}
              icon={o.name[0]}
              color={o.color}
              active={filter.ownerId === o.id}
              focused={focusedIdx === i}
              onClick={() => {
                setFilter({ kind: "person", ownerId: o.id });
                setOpen(false);
              }}
            />
          ))}
          <DefaultPinFooter
            isDefault={isDefault}
            setAsDefault={setAsDefault}
            clearDefault={clearDefault}
          />
        </Dropdown>
      )}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", opacity: 0.7 }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DefaultPinFooter({
  isDefault,
  setAsDefault,
  clearDefault,
}: {
  isDefault: boolean;
  setAsDefault: () => void;
  clearDefault: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 4,
        padding: "8px 10px",
        borderTop: "1px solid var(--hairline)",
        background: "var(--beige-new)",
      }}
    >
      <button
        onClick={isDefault ? clearDefault : setAsDefault}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderRadius: 6,
          background: "transparent",
          color: "var(--moss)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14, lineHeight: 1, color: isDefault ? "var(--citrus-deep, #C0C950)" : "var(--green-100)" }}>
          {isDefault ? "★" : "☆"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {isDefault ? "Pinned as your default" : "Set as default for this device"}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--green-100)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
              marginTop: 2,
            }}
          >
            {isDefault ? "Click to unpin" : "Loads on every refresh from this browser"}
          </div>
        </span>
      </button>
    </div>
  );
}

function Dropdown({
  header,
  sub,
  children,
}: {
  header: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        background: "var(--card-bg)",
        borderRadius: 14,
        border: "1px solid var(--beige-gray)",
        boxShadow: "var(--shadow-modal)",
        minWidth: 260,
        zIndex: 100,
        overflow: "hidden",
        color: "var(--moss)",
      }}
    >
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid var(--hairline)" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--green-100)",
          }}
        >
          {header}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontStyle: "italic",
            fontFamily: "var(--font-editorial)",
            marginTop: 3,
          }}
        >
          {sub}
        </div>
      </div>
      <div style={{ padding: 6, maxHeight: 360, overflowY: "auto" }}>{children}</div>
    </div>
  );
}

function DropdownOption({
  label,
  sub,
  icon,
  color,
  active,
  focused,
  onClick,
}: {
  label: string;
  sub: string;
  icon: string;
  color?: string;
  active: boolean;
  focused?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: focused ? "var(--light-grey)" : active ? "var(--beige-new)" : "transparent",
        boxShadow: focused ? "inset 3px 0 0 var(--moss)" : "none",
        color: "var(--moss)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.12s, box-shadow 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active && !focused) e.currentTarget.style.background = "var(--light-grey)";
      }}
      onMouseLeave={(e) => {
        if (!active && !focused) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: color || "var(--citrus)",
          color: "var(--moss)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--moss)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--green-100)", fontStyle: "italic", fontFamily: "var(--font-editorial)" }}>
          {sub}
        </div>
      </span>
      {active && (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--moss)",
            background: "var(--citrus)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Active
        </span>
      )}
    </button>
  );
}
