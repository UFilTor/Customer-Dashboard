"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MeetingPrepMeetingEntry } from "@/lib/types";
import { DashboardBanner } from "../DashboardBanner";
import { EditorialEmpty } from "../EditorialEmpty";
import { Icon } from "../Icon";
import { MeetingPrepBrief } from "./MeetingPrepBrief";

interface Props {
  // Pool counts for the eyebrow + KPI tiles. Server-computed so we don't
  // have to ship the full deals[] array just to render two numbers.
  dealsTotal: number;
  lifecycleDealsTotal: number;
  retentionDealsTotal: number;
  meetings: MeetingPrepMeetingEntry[];
  filterLabel?: string | null;
  fetchedDays?: Set<string>;
  fetchingDays?: Set<string>;
  onFetchDay?: (dayKey: string) => void;
  historyLoading?: boolean;
  onSelectCompany?: (companyId: string) => void;
}

const VISIBLE_DAYS = 5;
const PAST_WEEKDAYS = 4;
const FUTURE_WEEKDAYS = 9;

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime24(d: Date): string {
  if (isNaN(d.getTime())) return "n/a";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Memoized so the view doesn't re-render when page-client's parent state
// changes for unrelated reasons (filter pill open/close, command palette,
// toast). The bulk-data prop identity changes only on fetch.
export const MeetingPrepView = memo(function MeetingPrepViewImpl(props: Props) {
  return <MeetingsPanel {...props} />;
});

function MeetingsPanel({
  dealsTotal,
  lifecycleDealsTotal,
  retentionDealsTotal,
  meetings,
  fetchedDays,
  fetchingDays,
  onFetchDay,
  historyLoading,
  onSelectCompany,
}: Props) {
  const total = dealsTotal;

  // Group meetings by day key.
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingPrepMeetingEntry[]>();
    for (const e of meetings) {
      const d = new Date(e.meeting.startsAt);
      if (isNaN(d.getTime())) continue;
      const k = dayKey(d);
      const arr = map.get(k) || [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [meetings]);

  const today = startOfToday();
  const { weekdays, todayIdx } = useMemo(() => buildWeekdayStrip(), []);

  const [selectedIdx, setSelectedIdx] = useState(todayIdx);

  // ← / → keyboard nav.
  useEffect(() => {
    function onShift(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      setSelectedIdx((cur) => {
        if (dir === "prev") return Math.max(0, cur - 1);
        return Math.min(weekdays.length - 1, cur + 1);
      });
    }
    window.addEventListener("ud-meeting-prep-day-shift", onShift);
    return () => window.removeEventListener("ud-meeting-prep-day-shift", onShift);
  }, [weekdays.length]);

  const selectedDay = weekdays[selectedIdx] ?? today;
  const selectedKey = dayKey(selectedDay);
  const dayMeetings = meetingsByDay.get(selectedKey) || [];
  const meetingsTodayCount = (meetingsByDay.get(dayKey(today)) || []).length;

  const [focusedMeetingIdx, setFocusedMeetingIdx] = useState<number | null>(null);
  const [historyFocusedIdx, setHistoryFocusedIdx] = useState<number | null>(null);

  // Reset focus on day / meeting changes (adjust-during-render pattern).
  const [prevSelectedKey, setPrevSelectedKey] = useState(selectedKey);
  if (prevSelectedKey !== selectedKey) {
    setPrevSelectedKey(selectedKey);
    setFocusedMeetingIdx(null);
    setHistoryFocusedIdx(null);
  }
  const [prevFocusedMeetingIdx, setPrevFocusedMeetingIdx] = useState<number | null>(focusedMeetingIdx);
  if (prevFocusedMeetingIdx !== focusedMeetingIdx) {
    setPrevFocusedMeetingIdx(focusedMeetingIdx);
    setHistoryFocusedIdx(null);
  }

  // Broadcast focus levels so page-client.tsx can route arrow keys correctly.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-meeting-prep-meeting-focused-state", { detail: focusedMeetingIdx !== null })
    );
  }, [focusedMeetingIdx]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-meeting-prep-history-focused-state", { detail: historyFocusedIdx !== null })
    );
  }, [historyFocusedIdx]);

  const meetingsContainerRef = useRef<HTMLDivElement | null>(null);
  const dayMeetingsRef = useRef(dayMeetings);
  const focusedIdxRef = useRef(focusedMeetingIdx);
  const historyFocusedRef = useRef(historyFocusedIdx);
  useEffect(() => {
    dayMeetingsRef.current = dayMeetings;
    focusedIdxRef.current = focusedMeetingIdx;
    historyFocusedRef.current = historyFocusedIdx;
  });

  useEffect(() => {
    function onNav(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      const list = dayMeetingsRef.current;
      if (list.length === 0) return;
      const cur = focusedIdxRef.current;

      if (dir === "next") {
        setFocusedMeetingIdx(cur === null ? 0 : Math.min(list.length - 1, cur + 1));
        return;
      }
      if (cur === null || cur === 0) {
        setFocusedMeetingIdx(null);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      setFocusedMeetingIdx(cur - 1);
    }
    function onHistoryEnter() {
      const idx = focusedIdxRef.current;
      if (idx === null) return;
      const m = dayMeetingsRef.current[idx];
      if (!m) return;
      const count = Math.min(m.deal.history.length, 4);
      if (count === 0) return;
      setHistoryFocusedIdx(0);
    }
    function onHistoryExit() {
      setHistoryFocusedIdx(null);
    }
    function onHistoryNav(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      const meetingIdx = focusedIdxRef.current;
      if (meetingIdx === null) return;
      const m = dayMeetingsRef.current[meetingIdx];
      if (!m) return;
      const count = Math.min(m.deal.history.length, 4);
      if (count === 0) return;
      setHistoryFocusedIdx((cur) => {
        const start = cur ?? 0;
        return dir === "next" ? Math.min(count - 1, start + 1) : Math.max(0, start - 1);
      });
    }
    function onMeetingUnfocus() {
      setFocusedMeetingIdx(null);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    window.addEventListener("ud-meeting-prep-meeting-nav", onNav);
    window.addEventListener("ud-meeting-prep-meeting-unfocus", onMeetingUnfocus);
    window.addEventListener("ud-meeting-prep-history-enter", onHistoryEnter);
    window.addEventListener("ud-meeting-prep-history-exit", onHistoryExit);
    window.addEventListener("ud-meeting-prep-history-nav", onHistoryNav);
    return () => {
      window.removeEventListener("ud-meeting-prep-meeting-nav", onNav);
      window.removeEventListener("ud-meeting-prep-meeting-unfocus", onMeetingUnfocus);
      window.removeEventListener("ud-meeting-prep-history-enter", onHistoryEnter);
      window.removeEventListener("ud-meeting-prep-history-exit", onHistoryExit);
      window.removeEventListener("ud-meeting-prep-history-nav", onHistoryNav);
    };
  }, []);

  // Centre the focused card in the viewport.
  useEffect(() => {
    if (focusedMeetingIdx === null) return;
    const root = meetingsContainerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-meeting-idx="${focusedMeetingIdx}"]`);
    if (target && typeof (target as HTMLElement).scrollIntoView === "function") {
      (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedMeetingIdx]);

  const isToday = dayKey(selectedDay) === dayKey(today);

  // Sticky day-selector shadow. Mirrors the Portfolio pattern (a 1px sentinel
  // above the sticky wrapper observed via IntersectionObserver) so the shadow
  // flips on the exact frame the strip pins, regardless of TopBar layout.
  const daySentinelRef = useRef<HTMLDivElement | null>(null);
  const [dayScrolled, setDayScrolled] = useState(false);
  useEffect(() => {
    const node = daySentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => setDayScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Population breakdown comes pre-computed from the server (no client-side
  // deals array to filter through).
  const lifecycleDeals = lifecycleDealsTotal;
  const retentionDeals = retentionDealsTotal;

  const firstMeetingToday = meetingsTodayCount > 0
    ? fmtTime24(new Date((meetingsByDay.get(dayKey(today)) || [])[0].meeting.startsAt))
    : null;

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      <DashboardBanner
        eyebrow="Meeting prep"
        headline={
          <>
            {total} {total === 1 ? "customer" : "customers"} in scope.
          </>
        }
        detail={
          <>
            <span
              style={{
                color: "var(--citrus)",
                borderBottom: meetingsTodayCount > 0 ? "1px dashed color-mix(in oklch, var(--citrus) 55%, transparent)" : "none",
                paddingBottom: 1,
              }}
            >
              {meetingsTodayCount} meeting{meetingsTodayCount === 1 ? "" : "s"} today
            </span>
            {firstMeetingToday && <>, first at {firstMeetingToday}</>}
            . {meetings.length} across the next 5 work days
            {lifecycleDeals > 0 && retentionDeals > 0 && (
              <> ({lifecycleDeals} onboarding, {retentionDeals} live)</>
            )}
            .
          </>
        }
      />

      <div style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Sticky day-selector now leads the page (was below the KPI strip).
            Moving it to the top means a returning user lands directly on the
            day they last navigated to, no scroll-past required. */}
        <div ref={daySentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
        <div
          className={`mp-sticky${dayScrolled ? " scrolled" : ""}`}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "var(--beige-new)",
            paddingTop: 4,
            paddingBottom: 4,
            transition: "box-shadow 160ms var(--ease-out)",
            boxShadow: dayScrolled
              ? "0 1px 0 var(--hairline), 0 6px 12px -8px rgba(2, 44, 18, 0.10)"
              : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <button
              onClick={() => setSelectedIdx(todayIdx)}
              aria-label="Back to today"
              style={{
                visibility: selectedIdx === todayIdx ? "hidden" : "visible",
                padding: "6px 12px",
                borderRadius: 8,
                background: "var(--moss)",
                color: "var(--text-on-moss)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Back to today
            </button>
          </div>
          <DayStrip
            weekdays={weekdays}
            meetingsByDay={meetingsByDay}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
            today={today}
            todayIdx={todayIdx}
            fetchedDays={fetchedDays}
          />
        </div>

        {/* Day label is already pinned in the sticky strip above; the
            duplicate <h2> here was redundant and pushed the meetings down. */}
        <Section>
          {fetchedDays && !fetchedDays.has(selectedKey) ? (
            <FetchDayButton
              dayLabel={selectedDay.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              loading={!!fetchingDays?.has(selectedKey)}
              onFetch={() => onFetchDay?.(selectedKey)}
            />
          ) : dayMeetings.length === 0 ? (
            <EditorialEmpty
              headline={isToday ? "No meetings today. Enjoy the focus time." : "No meetings on this day."}
            />
          ) : (
            <div
              ref={meetingsContainerRef}
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}
            >
              {dayMeetings.map((entry, i) => {
                const isFocused = i === focusedMeetingIdx;
                return (
                  <div
                    key={`${entry.deal.dealId}:${entry.meeting.id}`}
                    data-meeting-idx={i}
                    style={{
                      animation: `staggerIn 360ms var(--ease-out) ${100 + Math.min(i, 8) * 60}ms both`,
                      borderRadius: 16,
                      outline: isFocused ? "2px solid var(--moss)" : "2px solid transparent",
                      outlineOffset: 2,
                      transition: "outline-color 120ms ease",
                    }}
                  >
                    <MeetingPrepBrief
                      entry={entry}
                      isFocused={isFocused}
                      historyFocusedIdx={isFocused ? historyFocusedIdx : null}
                      historyLoading={!!historyLoading}
                      onSelectCompany={onSelectCompany}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>
        </div>
      </div>
    </div>
  );
}

function buildWeekdayStrip(): { weekdays: Date[]; todayIdx: number } {
  const weekdays: Date[] = [];
  const today = startOfToday();
  const before: Date[] = [];
  const cursor = new Date(today);
  while (before.length < PAST_WEEKDAYS) {
    cursor.setDate(cursor.getDate() - 1);
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) before.push(new Date(cursor));
  }
  before.reverse();
  weekdays.push(...before);

  const anchor = new Date(today);
  if (anchor.getDay() === 0) anchor.setDate(anchor.getDate() + 1);
  if (anchor.getDay() === 6) anchor.setDate(anchor.getDate() + 2);
  const todayIdx = weekdays.length;
  weekdays.push(anchor);

  const fwd = new Date(anchor);
  let added = 0;
  while (added < FUTURE_WEEKDAYS) {
    fwd.setDate(fwd.getDate() + 1);
    const wd = fwd.getDay();
    if (wd === 0 || wd === 6) continue;
    weekdays.push(new Date(fwd));
    added++;
  }
  return { weekdays, todayIdx };
}

function DayStrip({
  weekdays,
  meetingsByDay,
  selectedIdx,
  setSelectedIdx,
  today,
  todayIdx,
  fetchedDays,
}: {
  weekdays: Date[];
  meetingsByDay: Map<string, MeetingPrepMeetingEntry[]>;
  selectedIdx: number;
  setSelectedIdx: (n: number) => void;
  today: Date;
  todayIdx: number;
  fetchedDays?: Set<string>;
}) {
  // On weekends, dayKey(today) doesn't match any visible weekday. The strip's
  // "today anchor" is the next workday — we still want it labelled clearly.
  const todayWeekday = today.getDay();
  const todayOnWeekend = todayWeekday === 0 || todayWeekday === 6;
  const half = Math.floor(VISIBLE_DAYS / 2);
  const start = Math.max(0, Math.min(weekdays.length - VISIBLE_DAYS, selectedIdx - half));
  const visible = weekdays.slice(start, start + VISIBLE_DAYS);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 18,
      }}
    >
      <ArrowButton
        disabled={selectedIdx === 0}
        onClick={() => setSelectedIdx(Math.max(0, selectedIdx - 1))}
        ariaLabel="Previous day"
      >
        <Icon.ArrowLeft />
      </ArrowButton>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${VISIBLE_DAYS}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {visible.map((d, i) => {
          const idx = start + i;
          const k = dayKey(d);
          const count = (meetingsByDay.get(k) || []).length;
          const isActive = idx === selectedIdx;
          const isTodayExact = k === dayKey(today);
          // When today is a weekend, the day strip's anchor (todayIdx) is the
          // next workday. Treat it as "today" for visual purposes so the
          // user has a stable point of reference.
          const isTodayAnchor = idx === todayIdx;
          const isToday = isTodayExact || (todayOnWeekend && isTodayAnchor);
          const isFetched = !fetchedDays || fetchedDays.has(k);
          const eyebrow = isTodayExact
            ? "Today"
            : todayOnWeekend && isTodayAnchor
              ? `Mon · next`
              : d.toLocaleDateString("en-US", { weekday: "short" });
          return (
            <button
              key={k}
              onClick={() => setSelectedIdx(idx)}
              aria-current={isToday ? "date" : undefined}
              style={{
                background: isActive ? "var(--moss)" : "var(--light-grey)",
                // Non-color "today" affordance: a thicker accent border so
                // the indication isn't carried by color alone (WCAG 1.4.1).
                border: `${isToday && !isActive ? 2 : 1}px ${isFetched ? "solid" : "dashed"} ${
                  isActive
                    ? "var(--moss)"
                    : isToday
                      ? "var(--moss)"
                      : "var(--beige-gray)"
                }`,
                borderRadius: 12,
                padding: isToday && !isActive ? "9px 7px" : "10px 8px",
                textAlign: "center",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                color: isActive ? "var(--text-on-moss)" : "var(--moss)",
                transition: "background 160ms ease, color 160ms ease, opacity 160ms ease",
                opacity: !isFetched && !isActive ? 0.7 : 1,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: isActive ? "var(--citrus)" : "var(--green-100)",
                }}
              >
                {eyebrow}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  // Non-color today signal: a moss underline accent on the
                  // date number so the indication survives without color.
                  // React 19 warns when shorthand and longhand decoration
                  // properties mix, so we use longhands only.
                  textDecorationLine: isToday && !isActive ? "underline" : "none",
                  textDecorationColor: "var(--moss)",
                  textDecorationThickness: 2,
                  textUnderlineOffset: 4,
                }}
              >
                {d.getDate()}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: isActive ? "rgba(255,255,255,0.75)" : "var(--green-100)",
                  fontFamily: "var(--font-editorial)",
                  fontStyle: "italic",
                }}
              >
                {!isFetched
                  ? "load"
                  : count > 0
                    ? `${count} mtg${count === 1 ? "" : "s"}`
                    : "none"}
              </span>
            </button>
          );
        })}
      </div>
      <ArrowButton
        disabled={selectedIdx === weekdays.length - 1}
        onClick={() => setSelectedIdx(Math.min(weekdays.length - 1, selectedIdx + 1))}
        ariaLabel="Next day"
      >
        <Icon.ArrowRight />
      </ArrowButton>
    </div>
  );
}

function ArrowButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 36,
        height: 56,
        borderRadius: 12,
        background: disabled ? "var(--light-grey)" : "var(--card-bg)",
        border: "1px solid var(--beige-gray)",
        color: disabled ? "var(--beige-gray)" : "var(--moss)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}


function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title?: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
}) {
  const hasHeader = !!title || !!subtitle || count != null;
  return (
    <div style={{ marginBottom: 32 }}>
      {hasHeader && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          {title && (
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--moss)",
                textTransform: "uppercase",
                letterSpacing: "-0.005em",
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <span
              style={{
                fontSize: 13,
                color: "var(--green-100)",
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
              }}
            >
              {subtitle}
            </span>
          )}
          {count != null && (
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--green-100)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {count} item{count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function FetchDayButton({
  dayLabel,
  loading,
  onFetch,
}: {
  dayLabel: string;
  loading: boolean;
  onFetch: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px dashed var(--beige-gray)",
        borderRadius: 14,
        padding: "36px 20px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-editorial)",
          fontStyle: "italic",
          fontSize: 14,
          color: "var(--green-100)",
        }}
      >
        {dayLabel} hasn&apos;t been fetched yet.
      </span>
      <button
        onClick={onFetch}
        disabled={loading}
        style={{
          padding: "9px 16px",
          borderRadius: 10,
          background: loading ? "var(--green-100)" : "var(--moss)",
          color: "var(--text-on-moss)",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Fetching…" : "Fetch this day"}
      </button>
    </div>
  );
}
