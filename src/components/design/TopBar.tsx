"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "./Icon";
import {
  OWNERS,
  OWNER_MAP,
  REGIONS,
  type GlobalFilter,
} from "@/lib/owners";
import { DashboardPicker, type DashboardKey } from "./VariantPicker";
import {
  FRESHNESS_EVENT,
  formatFreshness,
  getFreshnessSnapshot,
  type FreshnessDetail,
} from "@/lib/freshness";

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
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            whiteSpace: "nowrap",
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
        <div className="topbar-search-wrap">
          <button
            onClick={onOpenCmdk}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "var(--inverse-surface)",
              border: "1px solid var(--inverse-border)",
              color: "var(--inverse-text)",
              padding: "7px 12px",
              borderRadius: 10,
              fontSize: 13,
              width: "100%",
              minWidth: 0,
              maxWidth: 360,
              cursor: "pointer",
              transition: "background 160ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--inverse-surface-hover)"; e.currentTarget.style.color = "var(--inverse-text-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--inverse-surface)"; e.currentTarget.style.color = "var(--inverse-text)"; }}
          >
            <Icon.Search style={{ flexShrink: 0 }} />
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              Search companies…
            </span>
            <span
              style={{
                marginLeft: "auto",
                flexShrink: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--inverse-surface-hover)",
                padding: "2px 6px",
                borderRadius: 4,
                color: "var(--inverse-text-strong)",
              }}
            >
              {cmdLabel}
            </span>
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <FreshnessLabel dashboard={dashboard} />
        <FilterPill
          filter={filter}
          setFilter={setFilter}
          isDefault={isDefault}
          setAsDefault={setAsDefault}
          clearDefault={clearDefault}
        />
        <span aria-hidden="true" style={{ width: 1, height: 20, background: "var(--inverse-border)" }} />
        <DashboardPicker dashboard={dashboard} setDashboard={setDashboard} />
      </div>
    </nav>
  );
}

// Subtle "Updated 6m ago" data-age label for the active dashboard. Containers
// broadcast their payload's generatedAt via the ud-payload-freshness event;
// payloads cached before generatedAt shipped never report, so we render
// nothing for them. The label re-derives once a minute.
function FreshnessLabel({ dashboard }: { dashboard: DashboardKey }) {
  // Seed from the module-level snapshot in case a container dispatched
  // before this listener attached (mount-order race on first paint).
  const [freshness, setFreshness] = useState<Record<string, string>>(() =>
    getFreshnessSnapshot()
  );
  useEffect(() => {
    function onFreshness(e: Event) {
      const detail = (e as CustomEvent<FreshnessDetail>).detail;
      if (!detail?.dashboard || !detail.generatedAt) return;
      setFreshness((prev) =>
        prev[detail.dashboard] === detail.generatedAt
          ? prev
          : { ...prev, [detail.dashboard]: detail.generatedAt }
      );
    }
    window.addEventListener(FRESHNESS_EVENT, onFreshness);
    return () => window.removeEventListener(FRESHNESS_EVENT, onFreshness);
  }, []);

  // Minute tick so the relative label stays current without new events.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const iso = freshness[dashboard];
  const label = iso ? formatFreshness(iso) : null;
  if (!label) return null;

  return (
    <span
      className="topbar-freshness"
      title={`Data fetched from HubSpot at ${new Date(iso).toLocaleTimeString()}`}
      style={{
        fontSize: 11,
        color: "var(--inverse-text)",
        whiteSpace: "nowrap",
        marginRight: 4,
      }}
    >
      {label}
    </span>
  );
}

function pillStyle(highlighted: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 14px",
    borderRadius: 10,
    background: highlighted ? "rgba(241,249,126,0.12)" : "var(--inverse-surface)",
    color: "var(--inverse-text-strong)",
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

const TYPE_OPTIONS = ["region", "person"] as const;
type FilterKind = (typeof TYPE_OPTIONS)[number];
const KIND_LABEL: Record<FilterKind, string> = { region: "Region", person: "Person" };

interface FilterOption {
  key: string;
  label: string;
  /** Avatar swatch. Regions render without one. */
  color?: string;
  initial?: string;
  value: GlobalFilter;
}

// "All" is not a category with members - it spans regions and people both -
// so it sits above the tab strip as a permanent row rather than inside either
// tab. That leaves both tabs behaving identically: they switch which list you
// are looking at, and nothing more.
const ALL_OPTION: FilterOption = { key: "all", label: "All accounts", value: { kind: "all" } };

// The options behind each tab.
function optionsFor(kind: FilterKind): FilterOption[] {
  if (kind === "region") {
    return REGIONS.map((r) => ({
      key: r.key,
      label: r.label,
      value: { kind: "region", region: r.key },
    }));
  }
  return OWNERS.map((o) => ({
    key: o.id,
    label: o.name,
    color: o.color,
    initial: o.initial || o.name[0],
    value: { kind: "person", ownerId: o.id },
  }));
}

function isActiveOption(filter: GlobalFilter, o: FilterOption): boolean {
  if (filter.kind !== o.value.kind) return false;
  if (filter.kind === "region" && o.value.kind === "region") return filter.region === o.value.region;
  if (filter.kind === "person" && o.value.kind === "person") return filter.ownerId === o.value.ownerId;
  return true;
}

// One selector for all filter states, replacing the old type + value pill pair
// that handed off to each other. The tab strip keeps the panel short: it never
// shows more rows than the largest single group, which matters as the CS team
// grows - a flat list of every state would grow without bound.
function FilterPill({ filter, setFilter, isDefault, setAsDefault, clearDefault }: PillProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterKind>(filter.kind === "person" ? "person" : "region");
  const [focusedIdx, setFocusedIdx] = useState(0);
  const ref = useDropdownDismiss(open, setOpen);

  const isFiltered = filter.kind !== "all";
  // Focus indices count the All row above the strip as 0, so arrow order
  // matches what you see top to bottom.

  // Trigger shows the resolved selection, not the kind: "Denmark" and "Filip"
  // already say which axis they are.
  const owner = filter.kind === "person" ? OWNER_MAP[filter.ownerId] : null;
  const valueLabel =
    filter.kind === "all"
      ? "All"
      : filter.kind === "region"
        ? REGIONS.find((r) => r.key === filter.region)?.label ?? filter.region
        : owner?.name ?? "Pick";

  // Broadcast open state so page-client suppresses its own shortcuts while the
  // panel is up.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ud-filter-pill-state", { detail: open }));
  }, [open]);

  // External open (F key) and global close.
  useEffect(() => {
    function onOpenEvt() { setOpen(true); }
    function onCloseAll() { setOpen(false); }
    window.addEventListener("ud-filter-open", onOpenEvt);
    window.addEventListener("ud-filter-close-all", onCloseAll);
    return () => {
      window.removeEventListener("ud-filter-open", onOpenEvt);
      window.removeEventListener("ud-filter-close-all", onCloseAll);
    };
  }, []);

  // Opening lands on the active filter's own tab and row, so the panel always
  // opens showing where you already are.
  useEffect(() => {
    if (!open) return;
    const t: FilterKind = filter.kind === "person" ? "person" : "region";
    setTab(t);
    if (filter.kind === "all") {
      setFocusedIdx(0);
      return;
    }
    const i = optionsFor(t).findIndex((o) => isActiveOption(filter, o));
    setFocusedIdx(i >= 0 ? i + 1 : 0);
  }, [open, filter]);

  const apply = (o: FilterOption) => {
    setFilter(o.value);
    setOpen(false);
  };

  // Left/right walks the tab strip, up/down the list under it. Mirrors the
  // panel's own layout so the keys match what you see.
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; });
  const focusedRef = useRef(focusedIdx);
  useEffect(() => { focusedRef.current = focusedIdx; });
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const len = optionsFor(tabRef.current).length + 1; // + the All row
        setFocusedIdx((i) =>
          e.key === "ArrowDown" ? Math.min(len - 1, i + 1) : Math.max(0, i - 1)
        );
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const i = TYPE_OPTIONS.indexOf(tabRef.current);
        const next = TYPE_OPTIONS[
          e.key === "ArrowRight"
            ? Math.min(TYPE_OPTIONS.length - 1, i + 1)
            : Math.max(0, i - 1)
        ];
        pickTab(next);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const o = [ALL_OPTION, ...optionsFor(tabRef.current)][focusedRef.current];
        if (o) apply(o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Both tabs only switch the visible list; applying is always a row click.
  function pickTab(next: FilterKind) {
    setTab(next);
    setFocusedIdx(0);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Filter: ${valueLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...pillStyle(isFiltered), width: "var(--filter-pill-w)" }}
      >
        <span style={{ color: "var(--inverse-text)", flexShrink: 0 }}>Filter</span>
        {owner && (
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: owner.color || "var(--citrus)",
              color: "var(--moss)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {owner.initial || owner.name[0]}
          </span>
        )}
        <span
          style={{
            fontWeight: 700,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {valueLabel}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", flexShrink: 0 }}>
          <Caret open={open} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Filter scope"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            // Centred on the trigger so the extra width the tab strip needs
            // overhangs evenly left and right.
            left: "50%",
            transform: "translateX(-50%)",
            width: "var(--filter-panel-w)",
            background: "var(--card-bg)",
            border: "1px solid var(--beige-gray)",
            borderRadius: 14,
            boxShadow: "var(--shadow-modal)",
            zIndex: 100,
            overflow: "hidden",
            color: "var(--moss)",
          }}
        >
          {/* "All" lives above the strip, not inside a tab: it belongs to
              neither category, and keeping it here means clearing the filter
              is one click from whichever tab you happen to be on. */}
          <div style={{ padding: "6px 6px 0" }}>
            <FilterRow
              option={ALL_OPTION}
              active={filter.kind === "all"}
              focused={focusedIdx === 0}
              onSelect={() => apply(ALL_OPTION)}
              onHover={() => setFocusedIdx(0)}
            />
          </div>
          <div style={{ height: 1, background: "var(--hairline)", margin: "6px 10px 0" }} />

          {/* Tab strip fills the panel: equal columns rather than
              content-width buttons floating in a wider box. */}
          <div
            role="tablist"
            aria-label="Filter by"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${TYPE_OPTIONS.length}, 1fr)`,
              gap: 2,
              margin: 6,
              padding: 2,
              background: "var(--beige-new)",
              border: "1px solid var(--beige-gray)",
              borderRadius: 10,
            }}
          >
            {TYPE_OPTIONS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => pickTab(k)}
                className={tab === k ? "seg-light-btn active" : "seg-light-btn"}
                style={{ justifyContent: "center", padding: "5px 4px" }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 6px 6px", maxHeight: 420, overflowY: "auto" }}>
            {optionsFor(tab).map((o, i) => (
              <FilterRow
                key={o.key}
                option={o}
                active={isActiveOption(filter, o)}
                focused={focusedIdx === i + 1}
                onSelect={() => apply(o)}
                onHover={() => setFocusedIdx(i + 1)}
              />
            ))}
          </div>

          <DefaultPinFooter
            isDefault={isDefault}
            setAsDefault={setAsDefault}
            clearDefault={clearDefault}
          />
        </div>
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

function FilterRow({
  option,
  active,
  focused,
  onSelect,
  onHover,
}: {
  option: FilterOption;
  active: boolean;
  focused: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: focused ? "var(--light-grey)" : active ? "var(--beige-new)" : "transparent",
        boxShadow: focused ? "inset 3px 0 0 var(--moss)" : "none",
        color: "var(--moss)",
        fontSize: 13,
        fontWeight: active ? 700 : 600,
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.12s, box-shadow 0.12s",
      }}
    >
      {option.color && (
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: option.color,
            color: "var(--moss)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {option.initial}
        </span>
      )}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {option.label}
      </span>
      {active && (
        <span style={{ marginLeft: "auto", flexShrink: 0, color: "var(--green-100)" }}>✓</span>
      )}
    </button>
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
        {/* Action labels, not state descriptions: with the explanatory line
            gone the label has to say what the click does. */}
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
          {isDefault ? "Remove as default" : "Set as default"}
        </span>
      </button>
    </div>
  );
}
