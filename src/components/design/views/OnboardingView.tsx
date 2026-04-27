"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  OnboardingDeal,
  OnboardingHistoryEntry,
  OnboardingMeetingEntry,
  OnboardingRisk,
} from "@/lib/types";

const HUBSPOT_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
const ONBOARDING_ACTIVITY_TYPES = new Set([
  "Onboarding",
  "Bloom Onboarding",
  "Grow onboarding meeting",
]);
import type { OnboardingSubview } from "../VariantPicker";
import { OWNER_MAP } from "@/lib/owners";
import { fmtMrr, relDays } from "@/lib/format-design";
import { CountUpInt, Stagger } from "../Motion";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { useListKeyboardNav } from "../useListKeyboardNav";

interface Props {
  subview: OnboardingSubview;
  deals: OnboardingDeal[];
  meetings: OnboardingMeetingEntry[];
  filterLabel?: string | null;
  onSelect: (deal: OnboardingDeal) => void;
  // Day strip integration: which dayKeys have been fetched (so the meeting
  // panel can show a "fetch this day" button on others), which are currently
  // in flight, and a callback to trigger a single-day fetch.
  fetchedDays?: Set<string>;
  fetchingDays?: Set<string>;
  onFetchDay?: (dayKey: string) => void;
}

// Tightened "Needs attention" rule per design ask:
// only flag accounts that are genuinely far past their expected window.
const ATTENTION_OVERDUE_THRESHOLD_DAYS = 30;

// Day strip: 5 weekdays visible at a time, selected one centred. Generate
// enough weekdays before + after today so the centre always has neighbours
// AND the user can navigate to days outside the default fetched window
// (those days show a "fetch this day" button instead of meetings).
const VISIBLE_DAYS = 5;
const PAST_WEEKDAYS = 4;
const FUTURE_WEEKDAYS = 9;

// Local-date day key (NOT toISOString — that flips across midnight in UTC).
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime24(d: Date): string {
  if (isNaN(d.getTime())) return "—";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Display label for an OnboardingStep — surfaces "In progress" instead of the
// internal "Adopted" value used by the classifier.
const STEP_LABELS: Record<string, string> = {
  Adopted: "In progress",
};

function toWebUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function OnboardingView({
  subview,
  deals,
  meetings,
  filterLabel,
  onSelect,
  fetchedDays,
  fetchingDays,
  onFetchDay,
}: Props) {
  if (subview === "attention") {
    return (
      <AttentionPanel
        deals={deals}
        filterLabel={filterLabel}
        onSelect={onSelect}
      />
    );
  }
  return (
    <MeetingsPanel
      deals={deals}
      meetings={meetings}
      filterLabel={filterLabel}
      onSelect={onSelect}
      fetchedDays={fetchedDays}
      fetchingDays={fetchingDays}
      onFetchDay={onFetchDay}
    />
  );
}

/* =====================================================
   Meeting prep panel
   ===================================================== */

function MeetingsPanel({
  deals,
  meetings,
  filterLabel,
  onSelect,
  fetchedDays,
  fetchingDays,
  onFetchDay,
}: {
  deals: OnboardingDeal[];
  meetings: OnboardingMeetingEntry[];
  filterLabel?: string | null;
  onSelect: (deal: OnboardingDeal) => void;
  fetchedDays?: Set<string>;
  fetchingDays?: Set<string>;
  onFetchDay?: (dayKey: string) => void;
}) {
  const total = deals.length;
  const totalAcv = deals.reduce((s, d) => s + d.acv, 0);

  // Group meetings by day key (YYYY-MM-DD).
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, OnboardingMeetingEntry[]>();
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
  // Build the weekday range: past N + today (or next weekday if weekend) + next M.
  const { weekdays, todayIdx } = useMemo(() => buildWeekdayStrip(), []);

  const [selectedIdx, setSelectedIdx] = useState(todayIdx);

  // ← / → keyboard nav, clamped to the strip bounds.
  useEffect(() => {
    function onShift(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      setSelectedIdx((cur) => {
        if (dir === "prev") return Math.max(0, cur - 1);
        return Math.min(weekdays.length - 1, cur + 1);
      });
    }
    window.addEventListener("ud-onboarding-day-shift", onShift);
    return () => window.removeEventListener("ud-onboarding-day-shift", onShift);
  }, [weekdays.length]);

  const selectedDay = weekdays[selectedIdx] ?? today;
  const selectedKey = dayKey(selectedDay);
  const dayMeetings = meetingsByDay.get(selectedKey) || [];
  const meetingsTodayCount = (meetingsByDay.get(dayKey(today)) || []).length;

  // Focused meeting card for ↑/↓ keyboard nav. null = nothing focused yet
  // (no card carries the highlight outline). The first ↓ press selects index
  // 0; subsequent presses move within bounds. Resets to null on day change.
  const [focusedMeetingIdx, setFocusedMeetingIdx] = useState<number | null>(null);
  // Focused history item *within* the focused meeting. Drives the
  // "→ enters Previous activity" flow and the toggle-expand behaviour.
  const [historyFocusedIdx, setHistoryFocusedIdx] = useState<number | null>(null);

  // Reset focus on day change and on meeting-focus change. Adjust-during-
  // render (no useEffect) is React's recommended pattern for "respond to a
  // prop / parent-state change with a state reset".
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

  // Broadcast the two focus levels so page.tsx can route ←/→/↑/↓/Enter/Space
  // appropriately (day-shift vs meeting-nav vs history-nav vs toggle).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-meeting-focused-state", { detail: focusedMeetingIdx !== null })
    );
  }, [focusedMeetingIdx]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-history-focused-state", { detail: historyFocusedIdx !== null })
    );
  }, [historyFocusedIdx]);

  const meetingsContainerRef = useRef<HTMLDivElement | null>(null);
  const dayMeetingsRef = useRef(dayMeetings);
  const focusedIdxRef = useRef(focusedMeetingIdx);
  const historyFocusedRef = useRef(historyFocusedIdx);
  const onSelectRef = useRef(onSelect);
  // Mirror the latest values so the once-attached event handlers below read
  // fresh data without needing to re-bind on every change.
  useEffect(() => {
    dayMeetingsRef.current = dayMeetings;
    focusedIdxRef.current = focusedMeetingIdx;
    historyFocusedRef.current = historyFocusedIdx;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    function onNav(e: Event) {
      const dir = (e as CustomEvent<"prev" | "next">).detail;
      const list = dayMeetingsRef.current;
      if (list.length === 0) return;
      const cur = focusedIdxRef.current;

      if (dir === "next") {
        // First press from unfocused state lands on the first card.
        setFocusedMeetingIdx(cur === null ? 0 : Math.min(list.length - 1, cur + 1));
        return;
      }

      // ↑ from the first card (or from unfocused) returns to the top of the
      // dashboard so the banner + day strip are back in view.
      if (cur === null || cur === 0) {
        setFocusedMeetingIdx(null);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      setFocusedMeetingIdx(cur - 1);
    }
    function onOpen() {
      const idx = focusedIdxRef.current;
      if (idx === null) return;
      const m = dayMeetingsRef.current[idx];
      if (m) onSelectRef.current(m.deal);
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
    window.addEventListener("ud-onboarding-meeting-nav", onNav);
    window.addEventListener("ud-onboarding-meeting-open", onOpen);
    window.addEventListener("ud-onboarding-meeting-unfocus", onMeetingUnfocus);
    window.addEventListener("ud-onboarding-history-enter", onHistoryEnter);
    window.addEventListener("ud-onboarding-history-exit", onHistoryExit);
    window.addEventListener("ud-onboarding-history-nav", onHistoryNav);
    return () => {
      window.removeEventListener("ud-onboarding-meeting-nav", onNav);
      window.removeEventListener("ud-onboarding-meeting-open", onOpen);
      window.removeEventListener("ud-onboarding-meeting-unfocus", onMeetingUnfocus);
      window.removeEventListener("ud-onboarding-history-enter", onHistoryEnter);
      window.removeEventListener("ud-onboarding-history-exit", onHistoryExit);
      window.removeEventListener("ud-onboarding-history-nav", onHistoryNav);
    };
  }, []);

  // Centre the focused card in the viewport when arrow nav lands on it, so
  // the whole brief is visible rather than clipped at the top/bottom edge.
  useEffect(() => {
    if (focusedMeetingIdx === null) return;
    const root = meetingsContainerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-meeting-idx="${focusedMeetingIdx}"]`);
    if (target && typeof (target as HTMLElement).scrollIntoView === "function") {
      (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedMeetingIdx]);

  // Classify by hs_activity_type — the property HubSpot uses for "Onboarding"
  // vs "Follow up meeting" tagging.
  const newOnboardings = meetings.filter((e) =>
    ONBOARDING_ACTIVITY_TYPES.has(e.meeting.activityType ?? "")
  ).length;
  const followUps = meetings.length - newOnboardings;

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const isToday = dayKey(selectedDay) === dayKey(today);

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
        padding: "32px 28px 60px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Hero
          eyebrow="Onboarding · Meeting prep"
          dateStr={dateStr}
          filterLabel={filterLabel}
          greeting={greeting}
          line1Number={total}
          line1Suffix={total === 1 ? "customer" : "customers"}
          line2="on their way to live."
          body={
            <>
              You have{" "}
              <strong style={{ color: "var(--citrus)" }}>
                {meetingsTodayCount} meeting{meetingsTodayCount === 1 ? "" : "s"} today
              </strong>
              {meetingsTodayCount > 0 && (
                <>
                  {" "}
                  — first at{" "}
                  {fmtTime24(
                    new Date((meetingsByDay.get(dayKey(today)) || [])[0].meeting.startsAt)
                  )}
                </>
              )}
              . {meetings.length} meetings booked across the next 5 work days.
              <br />
              Combined ACV in onboarding: {fmtMrr(totalAcv)}.
            </>
          }
        />

        <Stagger
          delay={70}
          initial={120}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
            marginBottom: 6,
          }}
        >
          <KpiTile label="In onboarding" value={<CountUpInt value={total} />} sub={`${fmtMrr(totalAcv)} ACV`} />
          <KpiTile
            label="Meetings today"
            value={<CountUpInt value={meetingsTodayCount} />}
            sub={meetingsTodayCount > 0 ? "prep below" : "all clear"}
            tone="accent"
          />
          <KpiTile
            label="This week"
            value={<CountUpInt value={meetings.length} />}
            sub={`${newOnboardings} new onboarding${newOnboardings === 1 ? "" : "s"} · ${followUps} follow-up${followUps === 1 ? "" : "s"}`}
          />
          <KpiTile
            label={isToday ? "Today's meetings" : "Selected day"}
            value={<CountUpInt value={dayMeetings.length} />}
            sub={
              isToday
                ? "viewing today"
                : selectedDay.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
            }
          />
        </Stagger>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: 6,
            minHeight: 32,
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
              color: "#fff",
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

        <Section
          title={
            isToday
              ? "Today's meetings"
              : selectedDay.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
          }
          subtitle="Your full brief before you join"
          count={dayMeetings.length}
        >
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
            <EmptyState text={isToday ? "No meetings today. Enjoy the focus time." : "No meetings on this day."} />
          ) : (
            <div
              ref={meetingsContainerRef}
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}
            >
              {dayMeetings.map((entry, i) => {
                const isFocused = i === focusedMeetingIdx;
                return (
                  <div
                    key={entry.meeting.id}
                    data-meeting-idx={i}
                    style={{
                      animation: `staggerIn 360ms cubic-bezier(0.22, 1, 0.36, 1) ${100 + Math.min(i, 8) * 60}ms both`,
                      borderRadius: 16,
                      outline: isFocused ? "2px solid var(--moss)" : "2px solid transparent",
                      outlineOffset: 2,
                      transition: "outline-color 120ms ease",
                    }}
                  >
                    <MeetingBriefCard
                      entry={entry}
                      onSelect={() => onSelect(entry.deal)}
                      isFocused={isFocused}
                      historyFocusedIdx={isFocused ? historyFocusedIdx : null}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function buildWeekdayStrip(): { weekdays: Date[]; todayIdx: number } {
  const weekdays: Date[] = [];
  const today = startOfToday();
  // Walk from PAST_WEEKDAYS weekdays before today through FUTURE_WEEKDAYS after.
  // Step backward in calendar days, only keeping Mon-Fri.
  const before: Date[] = [];
  const cursor = new Date(today);
  while (before.length < PAST_WEEKDAYS) {
    cursor.setDate(cursor.getDate() - 1);
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) before.push(new Date(cursor));
  }
  before.reverse(); // chronological
  weekdays.push(...before);

  // Today (if a weekday) — otherwise the next weekday is the anchor.
  const anchor = new Date(today);
  if (anchor.getDay() === 0) anchor.setDate(anchor.getDate() + 1); // Sun → Mon
  if (anchor.getDay() === 6) anchor.setDate(anchor.getDate() + 2); // Sat → Mon
  const todayIdx = weekdays.length;
  weekdays.push(anchor);

  // Future weekdays.
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
  meetingsByDay: Map<string, OnboardingMeetingEntry[]>;
  selectedIdx: number;
  setSelectedIdx: (n: number) => void;
  today: Date;
  todayIdx: number;
  fetchedDays?: Set<string>;
}) {
  // Visible window: 5 entries, selected centred where possible.
  // Clamp at the edges so we don't slice past the array bounds.
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
          const isToday = k === dayKey(today);
          const isFetched = !fetchedDays || fetchedDays.has(k);
          return (
            <button
              key={k}
              onClick={() => setSelectedIdx(idx)}
              style={{
                background: isActive ? "var(--moss)" : "var(--light-grey)",
                border: `1px ${isFetched ? "solid" : "dashed"} ${isActive ? "var(--moss)" : "var(--beige-gray)"}`,
                borderRadius: 12,
                padding: "10px 8px",
                textAlign: "center",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                color: isActive ? "#fff" : "var(--moss)",
                transition: "all 160ms ease",
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
                {isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
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
                  ? "fetch"
                  : count > 0
                    ? `${count} mtg${count === 1 ? "" : "s"}`
                    : "—"}
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
        background: disabled ? "var(--light-grey)" : "#fff",
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

/* =====================================================
   Needs attention panel
   ===================================================== */

function AttentionPanel({
  deals,
  filterLabel,
  onSelect,
}: {
  deals: OnboardingDeal[];
  filterLabel?: string | null;
  onSelect: (deal: OnboardingDeal) => void;
}) {
  // Per the spec: only show accounts >30 days past their expected step duration.
  const overdue = useMemo(
    () =>
      deals
        .filter((d) => d.daysInStep - d.expectedDaysInStep > ATTENTION_OVERDUE_THRESHOLD_DAYS)
        .sort((a, b) => {
          const overA = a.daysInStep - a.expectedDaysInStep;
          const overB = b.daysInStep - b.expectedDaysInStep;
          return overB - overA;
        }),
    [deals]
  );

  const byStep: Record<string, OnboardingDeal[]> = {};
  for (const d of overdue) {
    const arr = byStep[d.step] || [];
    arr.push(d);
    byStep[d.step] = arr;
  }

  // Flat list across step groups in render order — drives ↑/↓/Enter nav.
  const flatList = useMemo<OnboardingDeal[]>(
    () => Object.values(byStep).flat(),
    // overdue is the source of truth — recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overdue]
  );
  const idxByDealId = useMemo(() => {
    const m = new Map<string, number>();
    flatList.forEach((d, i) => m.set(d.dealId, i));
    return m;
  }, [flatList]);
  const { focusedIdx, containerRef } = useListKeyboardNav<OnboardingDeal>(
    flatList,
    (d) => onSelect(d)
  );

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const totalAcv = overdue.reduce((s, d) => s + d.acv, 0);

  return (
    <div
      style={{
        background: "var(--beige-new)",
        minHeight: "calc(100vh - 120px)",
        padding: "32px 28px 60px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Hero
          eyebrow="Onboarding · Needs attention"
          dateStr={dateStr}
          filterLabel={filterLabel}
          greeting={greeting}
          line1Number={overdue.length}
          line1Suffix={`account${overdue.length === 1 ? "" : "s"}`}
          line2={`more than ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days overdue.`}
          body={
            overdue.length === 0 ? (
              <>
                Nothing past the {ATTENTION_OVERDUE_THRESHOLD_DAYS}-day overdue mark right now —
                all onboarding accounts are tracking within their expected windows.
              </>
            ) : (
              <>
                Combined ACV at risk: <strong style={{ color: "var(--citrus)" }}>{fmtMrr(totalAcv)}</strong>.
                Each one has been stuck in their current step for more than{" "}
                {ATTENTION_OVERDUE_THRESHOLD_DAYS} days beyond the expected window. Sorted by how
                far past expected they are.
              </>
            )
          }
        />

        <Stagger
          delay={70}
          initial={120}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}
        >
          <KpiTile
            label="Past 30d overdue"
            value={<CountUpInt value={overdue.length} />}
            sub="needs intervention"
            tone={overdue.length > 0 ? "bad" : undefined}
          />
          <KpiTile
            label="Combined ACV"
            value={<>{fmtMrr(totalAcv)}</>}
            sub="at risk"
          />
          <KpiTile
            label="With blockers"
            value={<CountUpInt value={overdue.filter((d) => d.blockers.length > 0).length} />}
            sub="hibernation / hold"
            tone={overdue.some((d) => d.blockers.length > 0) ? "warn" : undefined}
          />
          <KpiTile
            label="Worst case"
            value={
              overdue.length === 0
                ? <>—</>
                : <>{overdue[0].daysInStep - overdue[0].expectedDaysInStep}d</>
            }
            sub={overdue.length === 0 ? "" : `${overdue[0].companyName}`}
            tone={overdue.length > 0 ? "bad" : undefined}
          />
        </Stagger>

        {overdue.length === 0 ? (
          <EmptyState
            text={`No onboarding accounts are more than ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days past their expected step duration.`}
          />
        ) : (
          <div ref={containerRef}>
            {Object.entries(byStep).map(([step, list]) => (
              <Section
                key={step}
                title={stepLabel(step)}
                subtitle={`${list.length} account${list.length === 1 ? "" : "s"} stuck > ${ATTENTION_OVERDUE_THRESHOLD_DAYS} days past expected`}
                count={list.length}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                  {list.map((d, i) => {
                    const globalIdx = idxByDealId.get(d.dealId) ?? -1;
                    return (
                      <StuckCard
                        key={d.dealId}
                        deal={d}
                        onClick={() => onSelect(d)}
                        index={i}
                        listIdx={globalIdx}
                        isFocused={globalIdx === focusedIdx}
                      />
                    );
                  })}
                </div>
              </Section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================
   Shared atoms
   ===================================================== */

function Hero({
  eyebrow,
  dateStr,
  filterLabel,
  greeting,
  line1Number,
  line1Suffix,
  line2,
  body,
}: {
  eyebrow: string;
  dateStr: string;
  filterLabel?: string | null;
  greeting: string;
  line1Number: number;
  line1Suffix: string;
  line2: string;
  body: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--moss)",
        color: "#fff",
        borderRadius: 20,
        padding: "32px 36px",
        marginBottom: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="drift-slow"
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "var(--citrus)",
          opacity: 0.1,
        }}
      />
      <div
        className="drift-slower"
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          border: "1px solid rgba(241,249,126,0.22)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--citrus)",
            }}
          >
            {eyebrow}
          </span>
          <span style={{ height: 1, flex: "0 0 32px", background: "rgba(241,249,126,0.4)" }} />
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
            }}
          >
            {dateStr}
          </span>
          {filterLabel && (
            <>
              <span style={{ height: 1, flex: "0 0 24px", background: "rgba(241,249,126,0.4)" }} />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--citrus)",
                  background: "rgba(241,249,126,0.10)",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                {filterLabel}
              </span>
            </>
          )}
        </div>

        <h1
          style={{
            margin: "0 0 8px",
            fontFamily: "var(--font-editorial)",
            fontWeight: 400,
            fontStyle: "italic",
            fontSize: 42,
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            color: "#fff",
          }}
        >
          {greeting}.
        </h1>
        <h2
          style={{
            margin: "0 0 18px",
            fontFamily: "var(--font-display)",
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.05,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            color: "#fff",
          }}
        >
          <span className="citrus-wipe" style={{ color: "var(--moss)" }}>
            <CountUpInt value={line1Number} duration={700} /> {line1Suffix}
          </span>
          <br />
          {line2}
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 720,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "var(--font-editorial)",
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
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
      {children}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: "good" | "warn" | "bad" | "accent";
}) {
  const ink =
    tone === "bad"
      ? "var(--rust)"
      : tone === "warn"
        ? "#B8761F"
        : tone === "good"
          ? "#0E7C4C"
          : tone === "accent"
            ? "#fff"
            : "var(--moss)";
  const bg = tone === "accent" ? "var(--moss)" : "var(--light-grey)";
  const labelColor = tone === "accent" ? "var(--citrus)" : "var(--green-100)";
  const subColor = tone === "accent" ? "rgba(241,249,126,0.9)" : "var(--green-100)";

  return (
    <div
      style={{
        background: bg,
        border: tone === "accent" ? "none" : "1px solid var(--beige-gray)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 32,
          lineHeight: 1,
          color: ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: subColor,
          marginTop: 6,
          fontStyle: "italic",
          fontFamily: "var(--font-editorial)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function RiskPill({ level, compact }: { level: OnboardingRisk; compact?: boolean }) {
  const map: Record<OnboardingRisk, { label: string; bg: string; fg: string }> = {
    low: { label: "on track", bg: "rgba(14,124,76,0.1)", fg: "#0E7C4C" },
    medium: { label: "watch", bg: "rgba(184,118,31,0.12)", fg: "#B8761F" },
    high: { label: "at risk", bg: "rgba(184,74,45,0.1)", fg: "var(--rust)" },
  };
  const m = map[level];
  return (
    <span
      style={{
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        textTransform: "uppercase",
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 6,
        background: m.bg,
        color: m.fg,
        letterSpacing: "0.06em",
        fontFamily: "var(--font-display)",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function Italic({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        color: "var(--green-100)",
        fontStyle: "italic",
        fontFamily: "var(--font-editorial)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px dashed var(--beige-gray)",
        borderRadius: 14,
        padding: "32px 20px",
        textAlign: "center",
        fontStyle: "italic",
        fontFamily: "var(--font-editorial)",
        fontSize: 14,
        color: "var(--green-100)",
      }}
    >
      {text}
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
          color: "#fff",
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

/* =====================================================
   Meeting brief card + supporting bits
   ===================================================== */

function MeetingBriefCard({
  entry,
  onSelect,
  isFocused,
  historyFocusedIdx,
}: {
  entry: OnboardingMeetingEntry;
  onSelect: () => void;
  isFocused?: boolean;
  historyFocusedIdx?: number | null;
}) {
  const { meeting, deal } = entry;
  const ownerLocal = OWNER_MAP[deal.ownerId] || null;
  const start = new Date(meeting.startsAt);
  const timeStr = fmtTime24(start);
  const dayStr = isNaN(start.getTime())
    ? ""
    : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const obNotes = deal.obNotes;
  const com = deal.commercial;
  const watchOuts = deal.blockers;
  const history = deal.history;
  const visibleHistory = history.slice(0, 4);

  // Lifted-up expanded state — keyed by entry id so toggling works whether
  // the user clicks the inline "Read more" button or fires Enter/Space while
  // a history item is keyboard-focused on this card.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle the keyboard-focused history item (only when this card is the
  // one with focus). Listener attaches/detaches with the focused state so
  // we never accidentally toggle on an off-screen card.
  const focusedHistoryRef = useRef<number | null>(historyFocusedIdx ?? null);
  useEffect(() => {
    focusedHistoryRef.current = historyFocusedIdx ?? null;
  });
  useEffect(() => {
    if (!isFocused) return;
    function onToggle() {
      const idx = focusedHistoryRef.current;
      if (idx === null || idx === undefined) return;
      const item = visibleHistory[idx];
      if (item) toggleExpanded(item.id);
    }
    window.addEventListener("ud-onboarding-history-toggle", onToggle);
    return () => window.removeEventListener("ud-onboarding-history-toggle", onToggle);
  }, [isFocused, visibleHistory]);

  // Scroll the focused history item into view whenever it changes.
  const historyContainerRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!isFocused) return;
    if (historyFocusedIdx === null || historyFocusedIdx === undefined) return;
    const root = historyContainerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-history-idx="${historyFocusedIdx}"]`);
    if (target && typeof (target as HTMLElement).scrollIntoView === "function") {
      (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isFocused, historyFocusedIdx]);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "20px 24px 18px",
          display: "grid",
          gridTemplateColumns: "180px 1fr auto",
          gap: 24,
          alignItems: "center",
          borderBottom: "1px solid var(--hairline)",
          background: "var(--beige-new)",
        }}
      >
        <div>
          <Eyebrow>{dayStr || "Scheduled"}</Eyebrow>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 34,
              fontWeight: 700,
              color: "var(--moss)",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              marginTop: 4,
            }}
          >
            {timeStr}
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {meeting.outcome && (
              <span
                style={{
                  background: "var(--lichen)",
                  color: "var(--moss)",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: "0.06em",
                }}
              >
                {meeting.outcome.toLowerCase()}
              </span>
            )}
            <span
              style={{
                fontSize: 11.5,
                color: "var(--green-100)",
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
              }}
            >
              {meeting.title}
            </span>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <button
              onClick={onSelect}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--moss)",
                textTransform: "uppercase",
                letterSpacing: "-0.005em",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {deal.companyName}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
              color: "var(--green-100)",
              flexWrap: "wrap",
            }}
          >
            <Avatar owner={ownerLocal} size={18} />
            <span>{deal.ownerName}</span>
            {deal.country && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{deal.country}</span>
              </>
            )}
            {deal.plan && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{deal.plan}</span>
              </>
            )}
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              Step: <strong style={{ color: "var(--moss)" }}>{stepLabel(deal.step)}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
          <button
            onClick={onSelect}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: "var(--citrus)",
              color: "var(--moss)",
              fontSize: 12.5,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icon.ArrowRight />
            View account
          </button>
          <a
            href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/deal/${deal.dealId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              background: "#fff",
              color: "var(--moss)",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--beige-gray)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Icon.External />
            Open in HubSpot
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "22px 24px", borderRight: "1px solid var(--hairline)" }}>
          <BriefSectionTitle>Customer</BriefSectionTitle>
          <BriefDL>
            <BriefRow label="Contact" value={obNotes.contactName} optional />
            <BriefRow
              label="Website"
              value={obNotes.companyDomain}
              link={obNotes.companyDomain ? toWebUrl(obNotes.companyDomain) : null}
              optional
            />
            <BriefRow
              label="Storefront"
              value={obNotes.storefrontLink}
              link={obNotes.storefrontLink}
              optional
            />
            {obNotes.understoryPayEnabled === true && (
              <BriefRow label="Pay status" value={obNotes.payStatus ?? "Enabled"} />
            )}
            {obNotes.understoryPayEnabled === false && (
              <BriefRow label="Understory Pay" value="No" />
            )}
          </BriefDL>

          <div style={{ height: 22 }} />

          <BriefSectionTitle>OB Notes</BriefSectionTitle>
          <BriefDL>
            <BriefRow
              label="Experiences to create"
              value={obNotes.experiencesLink}
              link={obNotes.experiencesLink && /^https?:\/\//i.test(obNotes.experiencesLink) ? obNotes.experiencesLink : null}
            />
            <BriefRow label="Customer needs" value={obNotes.customerNeeds} />
            <BriefRow label="Promises made" value={obNotes.promisesMade} />
            <BriefRow label="Grow notes" value={obNotes.growNotes} optional />
          </BriefDL>

          <div style={{ height: 22 }} />

          <BriefSectionTitle>Commercial</BriefSectionTitle>
          <BriefDL>
            <BriefRow label="Sales owner" value={com.salesOwner === "missing" ? null : com.salesOwner} />
            <BriefRow label="ACV" value={com.acv} />
            <BriefRow label="Booking fee" value={com.bookingFee} />
            <BriefRow label="Monthly fee" value={com.monthlyFee} />
            <BriefRow label="First billing" value={com.firstBilling} />
          </BriefDL>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <BriefSectionTitle>Previous activity</BriefSectionTitle>
            {visibleHistory.length === 0 ? (
              <Italic>No prior meetings logged.</Italic>
            ) : (
              <ul
                ref={historyContainerRef}
                style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}
              >
                {visibleHistory.map((entry, i) => (
                  <li
                    key={entry.id}
                    data-history-idx={i}
                    className="animate-fadeIn"
                  >
                    <HistoryItem
                      entry={entry}
                      expanded={expandedIds.has(entry.id)}
                      onToggleExpand={() => toggleExpanded(entry.id)}
                      focused={isFocused && historyFocusedIdx === i}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <BriefSectionTitle accent={watchOuts.length > 0}>Watch out for</BriefSectionTitle>
            {watchOuts.length === 0 ? (
              <Italic>Nothing flagged.</Italic>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {watchOuts.map((w, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--dark-moss)",
                      background: "rgba(184,74,45,0.06)",
                      border: "1px solid rgba(184,74,45,0.15)",
                      padding: "8px 12px",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--rust)",
                        marginTop: 2,
                        flexShrink: 0,
                      }}
                    >
                      !
                    </span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function stripMeetingBody(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<a\s+[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// HTML → text that preserves paragraph breaks so we can detect signatures /
// reply quotes line-by-line. Drop blockquotes since they're always replies.
function stripEmailHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<a\s+[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Cut everything from the signoff / signature / quoted reply onwards so each
// message reads as a clean unit. Multi-language since onboarding emails come
// in EN, SV, NO, DA, DE, FR.
function stripEmailReply(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const QUOTE_HEADER = [
    /^On\s+.+(\s+at\s+.+)?\s+wrote:?\s*$/i,
    /^Den\s+.+\s+skrev\s+.+:?\s*$/i,
    /^P[åa]\s+.+\s+skrev\s+.+:?\s*$/i,
    /^D\.\s+.+\s+skrev\s+.+:?\s*$/i,
    /^Le\s+.+\s+a\s+écrit\s*:?\s*$/i,
    /^Am\s+.+\s+schrieb\s+.+:?\s*$/i,
    /^From:\s+.+/i,
    /^_{3,}\s*$/,
    /^\s*-{2,}\s*Original\s+Message\s*-{2,}\s*$/i,
  ];
  const SIGNOFF = [
    /^\s*(best( regards)?|regards|thanks|thank you|cheers|kind regards|sincerely|br)[,!.]?\s*$/i,
    /^\s*(med vänliga hälsningar|m\.?v\.?h\.?|vänligen|hälsningar|tack)[,!.]?\s*$/i,
    /^\s*(hilsen|venlig hilsen|v\.?h\.?|takk|hyggelig|de bedste hilsner|venligst)[,!.]?\s*$/i,
    /^\s*(viele grüße|mit freundlichen grüßen|gruß|freundliche grüße)[,!.]?\s*$/i,
    /^\s*(cordialement|amicalement|salutations distinguées|bien cordialement)[,!.]?\s*$/i,
  ];
  const SENT_FROM = /^\s*(sent|skickat|gesendet|envoyé|enviado)\s+from\s+my\s+(iphone|ipad|android|mobile|blackberry|samsung)/i;
  const SIG_DELIM = /^\s*--\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (SIG_DELIM.test(raw)) break;
    if (SENT_FROM.test(line)) break;
    if (QUOTE_HEADER.some((p) => p.test(line))) break;
    if (SIGNOFF.some((p) => p.test(line))) break;
    if (line.startsWith(">")) continue;
    out.push(raw);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanEmailBody(raw: string | null | undefined): string {
  return stripEmailReply(stripEmailHtml(raw));
}

interface ParsedEmailThread {
  meta: string;
  latestOccurredAt: string;
  latestDirection: "INBOUND" | "OUTBOUND" | null;
  latestOwnerName: string | null;
  latestBody: string;
  earlier: {
    id: string;
    occurredAt: string;
    direction: "INBOUND" | "OUTBOUND" | null;
    ownerName: string | null;
    body: string;
  }[];
}

function parseEmailThread(thread: { id: string; occurredAt: string; body: string; direction: "INBOUND" | "OUTBOUND" | null; ownerName: string | null }[] | undefined): ParsedEmailThread | null {
  if (!thread || thread.length === 0) return null;
  const sorted = [...thread].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const latest = sorted[sorted.length - 1];
  const earlierAsc = sorted.slice(0, -1);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const startStr = fmtDate(sorted[0].occurredAt);
  const endStr = fmtDate(latest.occurredAt);
  const dateRange = startStr === endStr ? startStr : `${startStr} → ${endStr}`;

  const inbound = sorted.filter((m) => m.direction === "INBOUND").length;
  const outbound = sorted.filter((m) => m.direction === "OUTBOUND").length;
  const ownerName = sorted.find((m) => m.direction === "OUTBOUND" && m.ownerName)?.ownerName
    ?? sorted.find((m) => m.ownerName)?.ownerName
    ?? null;
  let participants = "";
  if (inbound > 0 && outbound > 0) participants = ownerName ? `${ownerName} ↔ customer` : "two-way";
  else if (outbound > 0) participants = ownerName ? `${ownerName} → customer` : "outbound only";
  else if (inbound > 0) participants = "customer inbound";

  const meta = [dateRange, `${sorted.length} message${sorted.length === 1 ? "" : "s"}`, participants]
    .filter(Boolean)
    .join(" · ");

  return {
    meta,
    latestOccurredAt: latest.occurredAt,
    latestDirection: latest.direction,
    latestOwnerName: latest.ownerName,
    latestBody: cleanEmailBody(latest.body),
    earlier: earlierAsc
      .slice()
      .reverse() // most recent of the older ones first
      .map((m) => ({
        id: m.id,
        occurredAt: m.occurredAt,
        direction: m.direction,
        ownerName: m.ownerName,
        body: cleanEmailBody(m.body),
      })),
  };
}

function fmtThreadTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} · ${time}`;
}

function dirLabel(d: "INBOUND" | "OUTBOUND" | null): string {
  if (d === "INBOUND") return "from customer";
  if (d === "OUTBOUND") return "from us";
  return "";
}

function EmailThreadCard({
  thread,
}: {
  thread: { id: string; occurredAt: string; body: string; direction: "INBOUND" | "OUTBOUND" | null; ownerName: string | null }[];
}) {
  const parsed = parseEmailThread(thread);
  if (!parsed) return null;
  const latestMetaLine = [
    fmtThreadTime(parsed.latestOccurredAt),
    dirLabel(parsed.latestDirection),
    parsed.latestOwnerName,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {parsed.meta && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {parsed.meta}
        </div>
      )}
      <div>
        <Eyebrow>Latest message</Eyebrow>
        {latestMetaLine && (
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-100)",
              marginTop: 4,
              marginBottom: 6,
            }}
          >
            {latestMetaLine}
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--dark-moss)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {parsed.latestBody || (
            <span style={{ fontStyle: "italic", color: "var(--green-100)" }}>(empty body)</span>
          )}
        </p>
      </div>
      {parsed.earlier.length > 0 && (
        <div>
          <Eyebrow>Earlier in thread</Eyebrow>
          <ul
            style={{
              margin: "6px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {parsed.earlier.map((m) => {
              const meta = [fmtThreadTime(m.occurredAt), dirLabel(m.direction), m.ownerName]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={m.id}
                  style={{
                    background: "var(--beige-new)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {meta && (
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        textTransform: "uppercase",
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--green-100)",
                        marginBottom: 4,
                      }}
                    >
                      {meta}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--dark-moss)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.body || (
                      <span style={{ fontStyle: "italic", color: "var(--green-100)" }}>(empty body)</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ParsedGong {
  brief: string | null;
  points: { title?: string; body: string }[];
  steps: string[];
}

// Extract Gong's structured sections from a stripped meeting body.
// Returns null when the body isn't Gong-formatted.
function parseGong(body: string): ParsedGong | null {
  if (!body || !/Call highlights by Gong/i.test(body)) return null;

  const brief = body
    .match(/Call brief:\s*([\s\S]+?)(?=Key Discussion Points:|Next steps:|$)/i)?.[1]
    ?.trim() ?? null;

  const pointsBlock = body
    .match(/Key Discussion Points:\s*([\s\S]+?)(?=Next steps:|$)/i)?.[1]
    ?.trim();
  const points: ParsedGong["points"] = [];
  if (pointsBlock) {
    const chunks = pointsBlock.split(/\s+(?=\d+\.\s)/);
    for (const raw of chunks) {
      const cleaned = raw.replace(/^\d+\.\s*/, "").trim();
      if (!cleaned) continue;
      const colonIdx = cleaned.indexOf(":");
      if (colonIdx > 0 && colonIdx < 80) {
        points.push({ title: cleaned.slice(0, colonIdx).trim(), body: cleaned.slice(colonIdx + 1).trim() });
      } else {
        points.push({ body: cleaned });
      }
    }
  }

  const stepsBlock = body.match(/Next steps:\s*([\s\S]+)$/i)?.[1]?.trim();
  const steps = stepsBlock ? stepsBlock.split(/\s*\*\s+/).map((s) => s.trim()).filter(Boolean) : [];

  return { brief, points, steps };
}

function kindLabel(kind: OnboardingHistoryEntry["kind"]): string {
  if (kind === "meeting") return "Meeting";
  if (kind === "call") return "Call";
  return "Email";
}

function kindStyles(kind: OnboardingHistoryEntry["kind"]): { bg: string; fg: string } {
  if (kind === "meeting") return { bg: "var(--lilac)", fg: "#581C87" };
  if (kind === "call") return { bg: "var(--sky-blue)", fg: "#1E40AF" };
  return { bg: "var(--lichen)", fg: "var(--moss)" };
}

function HistoryItem({
  entry,
  expanded,
  onToggleExpand,
  focused,
}: {
  entry: OnboardingHistoryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  focused?: boolean;
}) {
  const date = new Date(entry.occurredAt);
  const dateStr = isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isEmailThread = entry.kind === "email" && entry.thread && entry.thread.length > 0;
  const body = stripMeetingBody(entry.body);
  const gong = !isEmailThread ? parseGong(body) : null;
  const kStyles = kindStyles(entry.kind);

  // Default-collapsed teaser pulls Gong's "Next steps" because they're the most
  // actionable thing for prepping the next conversation.
  const teaserSteps = gong?.steps.slice(0, 3) ?? [];
  const remainingSteps = gong ? Math.max(0, gong.steps.length - teaserSteps.length) : 0;

  // Fallback excerpt for non-Gong meetings (or Gong with no Next steps section).
  const fallback = (() => {
    if (gong?.brief) return gong.brief;
    if (body) return body;
    return "";
  })();
  const fallbackExcerpt = fallback.length > 220 ? fallback.slice(0, 220).trim() + "…" : fallback;

  const threadMessages = entry.thread ?? [];
  const hasExpandable =
    isEmailThread
      ? threadMessages.length > 1 || (threadMessages[0]?.body?.length ?? 0) > 200
      : gong != null && (gong.points.length > 0 || (gong.brief && gong.brief.length > 0) || gong.steps.length > teaserSteps.length);

  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--dark-moss)",
        paddingLeft: 14,
        paddingRight: focused ? 8 : 0,
        paddingTop: focused ? 6 : 0,
        paddingBottom: focused ? 6 : 0,
        position: "relative",
        background: focused ? "var(--beige-new)" : "transparent",
        borderRadius: focused ? 8 : 0,
        boxShadow: focused ? "inset 3px 0 0 var(--moss)" : "none",
        transition: "background 0.12s, box-shadow 0.12s, padding 0.12s",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: focused ? 14 : 8,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--moss)",
          opacity: 0.5,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: kStyles.bg,
            color: kStyles.fg,
            padding: "2px 7px",
            borderRadius: 5,
          }}
        >
          {kindLabel(entry.kind)}
          {entry.kind === "email" && entry.direction === "INBOUND" ? " in" : ""}
          {entry.kind === "email" && entry.direction === "OUTBOUND" ? " out" : ""}
        </span>
        <strong style={{ color: "var(--moss)" }}>{dateStr}</strong>
        <span style={{ color: "var(--green-100)" }}>·</span>
        <span style={{ color: "var(--moss)", flex: 1, minWidth: 0 }}>
          {entry.title}
          {isEmailThread && threadMessages.length > 1 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: "var(--green-100)",
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
              }}
            >
              · {threadMessages.length} messages
            </span>
          )}
        </span>
        {hasExpandable && (
          <button
            onClick={onToggleExpand}
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--moss)",
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--beige-new)",
              border: "1px solid var(--beige-gray)",
              cursor: "pointer",
            }}
          >
            {expanded ? "Hide" : "Read more"}
          </button>
        )}
      </div>

      {teaserSteps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Eyebrow>Action items from this call</Eyebrow>
          <ul
            style={{
              margin: "4px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {teaserSteps.map((s, i) => (
              <li
                key={i}
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "var(--dark-moss)",
                  background: "rgba(241,249,126,0.18)",
                  border: "1px solid rgba(241,249,126,0.5)",
                  borderRadius: 6,
                  padding: "6px 10px",
                }}
              >
                {s}
              </li>
            ))}
          </ul>
          {!expanded && remainingSteps > 0 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--green-100)",
                marginTop: 4,
                fontStyle: "italic",
                fontFamily: "var(--font-editorial)",
              }}
            >
              + {remainingSteps} more action item{remainingSteps === 1 ? "" : "s"} (Read more)
            </div>
          )}
        </div>
      )}

      {teaserSteps.length === 0 && !isEmailThread && fallbackExcerpt && (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {fallbackExcerpt}
        </p>
      )}

      {isEmailThread && !expanded && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {(() => {
            const last = threadMessages[threadMessages.length - 1];
            const cleaned = cleanEmailBody(last.body).replace(/\s+/g, " ").slice(0, 220).trim();
            const prefix =
              last.direction === "INBOUND"
                ? "Latest reply: "
                : last.direction === "OUTBOUND"
                  ? "Latest sent: "
                  : "Latest: ";
            return `${prefix}${cleaned}${cleaned.length === 220 ? "…" : ""}`;
          })()}
        </p>
      )}

      {isEmailThread && expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
          }}
        >
          <EmailThreadCard thread={threadMessages} />
        </div>
      )}

      {expanded && gong && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {gong.brief && (
            <div>
              <Eyebrow>Brief</Eyebrow>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--dark-moss)", lineHeight: 1.55 }}>
                {gong.brief}
              </p>
            </div>
          )}
          {gong.points.length > 0 && (
            <div>
              <Eyebrow>Key discussion points</Eyebrow>
              <ol
                style={{
                  margin: "4px 0 0",
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {gong.points.map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--dark-moss)" }}>
                    {p.title && <strong style={{ color: "var(--moss)" }}>{p.title}: </strong>}
                    {p.body}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {gong.steps.length > teaserSteps.length && (
            <div>
              <Eyebrow>All action items</Eyebrow>
              <ul
                style={{
                  margin: "4px 0 0",
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {gong.steps.slice(teaserSteps.length).map((s, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--dark-moss)",
                      background: "rgba(241,249,126,0.18)",
                      border: "1px solid rgba(241,249,126,0.5)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BriefSectionTitle({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        textTransform: "uppercase",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: accent ? "var(--rust)" : "var(--moss)",
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {children}
    </div>
  );
}

function BriefDL({ children }: { children: React.ReactNode }) {
  return (
    <dl
      style={{
        margin: 0,
        padding: 0,
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        rowGap: 7,
        columnGap: 14,
        fontSize: 13,
      }}
    >
      {children}
    </dl>
  );
}

function BriefRow({
  label,
  value,
  optional,
  link,
}: {
  label: string;
  value: string | null;
  optional?: boolean;
  link?: string | null;
}) {
  const missing = value == null || value === "" || value === "missing";
  return (
    <>
      <dt
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--green-100)",
          paddingTop: 2,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: missing ? "var(--green-100)" : "var(--moss)",
          fontStyle: missing ? "italic" : "normal",
          fontFamily: missing ? "var(--font-editorial)" : "inherit",
          opacity: missing ? 0.7 : 1,
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {missing ? (optional ? "—" : "missing") : link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--moss)", textDecoration: "underline" }}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}

/* =====================================================
   Stuck card (used by AttentionPanel)
   ===================================================== */

function StuckCard({ deal: d, onClick, index = 0, listIdx, isFocused }: { deal: OnboardingDeal; onClick: () => void; index?: number; listIdx?: number; isFocused?: boolean }) {
  const ownerLocal = OWNER_MAP[d.ownerId] || null;
  const overBy = d.daysInStep - d.expectedDaysInStep;
  const delay = 80 + Math.min(index, 10) * 24;
  return (
    <button
      onClick={onClick}
      data-list-idx={listIdx}
      style={{
        background: isFocused ? "var(--beige-new)" : "var(--light-grey)",
        border: `1px solid ${isFocused ? "var(--moss)" : "var(--beige-gray)"}`,
        boxShadow: isFocused ? "inset 3px 0 0 var(--moss)" : "none",
        borderRadius: 14,
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "1fr 220px 160px 140px",
        gap: 16,
        alignItems: "center",
        textAlign: "left",
        cursor: "pointer",
        animation: `staggerIn 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--moss)" }}>{d.companyName}</span>
          <RiskPill level={d.riskLevel} compact />
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--green-100)",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
          }}
        >
          {d.blockers.length > 0
            ? d.blockers[0]
            : `In ${stepLabel(d.step)} for ${d.daysInStep}d (expected ${d.expectedDaysInStep}d)`}
        </div>
      </div>
      <div>
        <Eyebrow>Stuck at</Eyebrow>
        <div style={{ fontSize: 13, color: "var(--moss)", fontWeight: 600 }}>{stepLabel(d.step)}</div>
        {overBy > 0 && (
          <div style={{ fontSize: 11, color: "var(--rust)", marginTop: 2 }}>
            {overBy}d over expected
          </div>
        )}
      </div>
      <div>
        <Eyebrow>Last touch</Eyebrow>
        <div style={{ fontSize: 13, color: "var(--moss)" }}>{relDays(d.lastTouch)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <Avatar owner={ownerLocal} size={24} />
        <span style={{ fontSize: 12, color: "var(--green-100)" }}>{d.ownerName.split(" ")[0]}</span>
      </div>
    </button>
  );
}
