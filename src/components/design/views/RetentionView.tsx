"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RetentionDeal,
  RetentionMeetingEntry,
} from "@/lib/types";
import { CountUpInt, Stagger } from "../Motion";
import { Icon } from "../Icon";
import { RetentionBrief } from "./RetentionBrief";

interface Props {
  deals: RetentionDeal[];
  meetings: RetentionMeetingEntry[];
  filterLabel?: string | null;
  // Day strip integration: which dayKeys have been fetched (so the meeting
  // panel can show a "fetch this day" button on others), which are currently
  // in flight, and a callback to trigger a single-day fetch.
  fetchedDays?: Set<string>;
  fetchingDays?: Set<string>;
  onFetchDay?: (dayKey: string) => void;
  // True while /api/retention/history is in flight on first paint. Drives
  // a skeleton row in the brief's Previous activity section so the lazy
  // calls/emails don't pop in silently.
  historyLoading?: boolean;
}

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

export function RetentionView(props: Props) {
  return <MeetingsPanel {...props} />;
}

/* =====================================================
   Meeting prep panel
   ===================================================== */

function MeetingsPanel({
  deals,
  meetings,
  filterLabel,
  fetchedDays,
  fetchingDays,
  onFetchDay,
  historyLoading,
}: Props) {
  const total = deals.length;

  // Group meetings by day key (YYYY-MM-DD).
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, RetentionMeetingEntry[]>();
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
    window.addEventListener("ud-retention-day-shift", onShift);
    return () => window.removeEventListener("ud-retention-day-shift", onShift);
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
      new CustomEvent("ud-retention-meeting-focused-state", { detail: focusedMeetingIdx !== null })
    );
  }, [focusedMeetingIdx]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-retention-history-focused-state", { detail: historyFocusedIdx !== null })
    );
  }, [historyFocusedIdx]);

  const meetingsContainerRef = useRef<HTMLDivElement | null>(null);
  const dayMeetingsRef = useRef(dayMeetings);
  const focusedIdxRef = useRef(focusedMeetingIdx);
  const historyFocusedRef = useRef(historyFocusedIdx);
  // Mirror the latest values so the once-attached event handlers below read
  // fresh data without needing to re-bind on every change.
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
    window.addEventListener("ud-retention-meeting-nav", onNav);
    window.addEventListener("ud-retention-meeting-unfocus", onMeetingUnfocus);
    window.addEventListener("ud-retention-history-enter", onHistoryEnter);
    window.addEventListener("ud-retention-history-exit", onHistoryExit);
    window.addEventListener("ud-retention-history-nav", onHistoryNav);
    return () => {
      window.removeEventListener("ud-retention-meeting-nav", onNav);
      window.removeEventListener("ud-retention-meeting-unfocus", onMeetingUnfocus);
      window.removeEventListener("ud-retention-history-enter", onHistoryEnter);
      window.removeEventListener("ud-retention-history-exit", onHistoryExit);
      window.removeEventListener("ud-retention-history-nav", onHistoryNav);
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
          eyebrow="Retention · Meeting prep"
          filterLabel={filterLabel}
          line1Number={total}
          line1Suffix={total === 1 ? "live customer" : "live customers"}
          line2="staying with us."
          body={
            <>
              You have{" "}
              <strong style={{ color: "var(--citrus)" }}>
                {meetingsTodayCount} meeting{meetingsTodayCount === 1 ? "" : "s"} today
              </strong>
              {meetingsTodayCount > 0 && (
                <>
                  {" "}, first at{" "}
                  {fmtTime24(
                    new Date((meetingsByDay.get(dayKey(today)) || [])[0].meeting.startsAt)
                  )}
                </>
              )}
              . {meetings.length} meetings booked across the next 5 work days.
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
          <KpiTile label="Live customers" value={<CountUpInt value={total} />} sub="in retention" />
          <KpiTile
            label="Meetings today"
            value={<CountUpInt value={meetingsTodayCount} />}
            sub={meetingsTodayCount > 0 ? "prep below" : "all clear"}
            tone="accent"
          />
          <KpiTile
            label="This week"
            value={<CountUpInt value={meetings.length} />}
            sub="across the next 5 work days"
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
                    <RetentionBrief
                      entry={entry}
                      isFocused={isFocused}
                      historyFocusedIdx={isFocused ? historyFocusedIdx : null}
                      historyLoading={!!historyLoading}
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
  if (anchor.getDay() === 0) anchor.setDate(anchor.getDate() + 1); // Sun -> Mon
  if (anchor.getDay() === 6) anchor.setDate(anchor.getDate() + 2); // Sat -> Mon
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
  fetchedDays,
}: {
  weekdays: Date[];
  meetingsByDay: Map<string, RetentionMeetingEntry[]>;
  selectedIdx: number;
  setSelectedIdx: (n: number) => void;
  today: Date;
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
   Shared atoms
   ===================================================== */

function Hero({
  eyebrow,
  filterLabel,
  line1Number,
  line1Suffix,
  line2,
  body,
}: {
  eyebrow: string;
  filterLabel?: string | null;
  line1Number: number;
  line1Suffix: string;
  line2: string;
  body: React.ReactNode;
}) {
  // Date depends on the user's local clock. SSR renders an empty string and the
  // client fills it on first paint; suppressHydrationWarning tells React this
  // mismatch is intentional and not a real bug.
  const dateStr = typeof window === "undefined"
    ? ""
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div
      style={{
        background: "var(--moss)",
        color: "var(--text-on-moss)",
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
            suppressHydrationWarning
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
            margin: "0 0 18px",
            fontFamily: "var(--font-display)",
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.05,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            color: "var(--text-on-moss)",
          }}
        >
          <span className="citrus-wipe" style={{ color: "var(--moss)" }}>
            <CountUpInt value={line1Number} duration={700} /> {line1Suffix}
          </span>
          <br />
          {line2}
        </h1>

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
        ? "var(--status-warn-bold)"
        : tone === "good"
          ? "var(--status-good-bold)"
          : tone === "accent"
            ? "var(--text-on-moss)"
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
