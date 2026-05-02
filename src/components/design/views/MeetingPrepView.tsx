"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MeetingPrepMeetingEntry } from "@/lib/types";
import { CountUpInt, Stagger } from "../Motion";
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

export function MeetingPrepView(props: Props) {
  return <MeetingsPanel {...props} />;
}

function MeetingsPanel({
  dealsTotal,
  lifecycleDealsTotal,
  retentionDealsTotal,
  meetings,
  filterLabel,
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

  // Population breakdown comes pre-computed from the server (no client-side
  // deals array to filter through).
  const lifecycleDeals = lifecycleDealsTotal;
  const retentionDeals = retentionDealsTotal;

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
          eyebrow="Meeting prep"
          filterLabel={filterLabel}
          line1Number={total}
          line1Suffix={total === 1 ? "customer" : "customers"}
          line2="ready for prep."
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
              {lifecycleDeals > 0 && retentionDeals > 0 && (
                <>
                  {" "}
                  {lifecycleDeals} onboarding · {retentionDeals} live customer
                  {retentionDeals === 1 ? "" : "s"} in scope.
                </>
              )}
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
          <KpiTile
            label="In scope"
            value={<CountUpInt value={total} />}
            sub={
              lifecycleDeals > 0 && retentionDeals > 0
                ? `${lifecycleDeals} onboarding · ${retentionDeals} retention`
                : lifecycleDeals > 0
                  ? "all onboarding"
                  : retentionDeals > 0
                    ? "all live customers"
                    : "no deals"
            }
          />
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
            <EmptyState
              text={isToday ? "No meetings today. Enjoy the focus time." : "No meetings on this day."}
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
  fetchedDays,
}: {
  weekdays: Date[];
  meetingsByDay: Map<string, MeetingPrepMeetingEntry[]>;
  selectedIdx: number;
  setSelectedIdx: (n: number) => void;
  today: Date;
  fetchedDays?: Set<string>;
}) {
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
  const dateStr =
    typeof window === "undefined"
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
