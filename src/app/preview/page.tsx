"use client";

import { useState, useRef, useEffect } from "react";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricCards } from "@/components/MetricCards";
import { TabContainer } from "@/components/TabContainer";
import { OverviewTab } from "@/components/OverviewTab";
import { ActivityTab } from "@/components/ActivityTab";
import { TasksTab } from "@/components/TasksTab";
import { SkeletonCard, SkeletonBlock, SkeletonRecap } from "@/components/Skeleton";
import { AttentionGroup as AttentionGroupComponent } from "@/components/AttentionGroup";
import { CompanyDetail, OwnerMap, StageMap, Engagement, TaskItem, AttentionResponse, CompanySearchResult } from "@/lib/types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";
import { SearchBar } from "@/components/SearchBar";
import { addRecentCompany } from "@/lib/recent-companies";

interface CompanyData extends CompanyDetail {
  owners: OwnerMap;
  stages: StageMap;
}

// Static timestamps to avoid SSR/client hydration mismatch
// These represent relative days ago from 2026-03-24
const daysAgo = (d: number) => String(new Date("2026-03-24T12:00:00Z").getTime() - d * 86400000);
const daysAgoISO = (d: number) => new Date(new Date("2026-03-24T12:00:00Z").getTime() - d * 86400000).toISOString();

const MOCK_DATA: CompanyData = {
  company: {
    name: "Acme Adventures AB",
    domain: "acmeadventures.se",
    hubspot_owner_id: "1",
    notes_last_contacted: "2026-03-21T10:00:00.000Z",
    understory_total_number_of_transactions: "847",
    understory_booking_volume_all_time: "412000",
    understory_booking_volume_12m: "186000",
    health_score: "65",
  },
  deal: {
    dealname: "Acme Adventures - Pro",
    dealstage: "stage_active",
    confirmed__contract_mrr: "2400",
    booking_fee: "0.035",
    understory_pay_status__customer: "Active",
    unpaid_invoice: "false",
    pipeline: "lifecycle",
    deal_currency_code: "SEK",
    "Storefront link": "https://acmeadventures.understory.io",
  },
  engagements: [
    {
      type: "call",
      title: "Quarterly check-in",
      body: "Discussed upcoming season preparations. Anna mentioned they're expecting 40% more bookings this summer compared to last year. They want to explore group booking functionality and asked about integrating with their existing CRM. We also talked about their experience with Understory Pay - they're happy with the conversion rates but want better reporting on failed payments. Action item: send them the group booking beta docs and schedule a follow-up demo.",
      bodyPreview: "Discussed upcoming season preparations. Anna mentioned they're expecting 40% more bookings...",
      summary: "Customer expects 40% booking growth this summer and wants group booking functionality. Happy with Understory Pay conversion but needs better failed payment reporting. Action items: send group booking beta docs, schedule follow-up demo.",
      timestamp: daysAgo(3),
      direction: "OUTBOUND",
      status: "COMPLETED",
    },
    {
      type: "email",
      title: "Re: Booking page setup",
      body: "Hi Filip,\n\nThanks for the help with the booking page! The new layout looks great and we've already seen a 15% increase in completed bookings since we switched over last week.\n\nOne thing - could we add a map widget to the kayaking tour page? Customers keep asking where the meeting point is.\n\nAlso, quick question: is there a way to set different cancellation policies per experience type? We want stricter rules for the multi-day tours.\n\nBest,\nAnna",
      bodyPreview: "Hi Filip, Thanks for the help with the booking page! The new layout looks great...",
      summary: "Customer reports 15% increase in completed bookings after page redesign. Requesting two features: a map widget for meeting point locations and per-experience cancellation policy settings for multi-day tours.",
      timestamp: daysAgo(5),
      direction: "INCOMING",
      fromEmail: "anna@acmeadventures.se",
      toEmail: "filip@understory.io",
    },
    {
      type: "meeting",
      title: "Onboarding session #3",
      body: "Final onboarding session covering payment setup and booking flow customization. Walked through Understory Pay integration with their Stripe account. Set up automated confirmation emails with custom branding. Configured waitlist functionality for their popular weekend tours. Anna comfortable managing everything independently now. Remaining setup: connect their Google Calendar for availability sync (Anna to do on her end). Graduation from onboarding - moving to regular CS check-in cadence.",
      bodyPreview: "Final onboarding session covering payment setup and booking flow customization...",
      summary: "Completed final onboarding session. Set up Understory Pay with Stripe, automated confirmation emails, and waitlist for weekend tours. Customer is self-sufficient. One remaining item: Anna to connect Google Calendar for availability sync. Transitioning to regular CS check-in cadence.",
      timestamp: daysAgo(12),
      outcome: "COMPLETED",
    },
    {
      type: "note",
      title: "Note",
      body: "Customer mentioned they want to start using Bloom for marketing next quarter. They've been doing their own email campaigns but want to leverage Understory's audience reach. Budget approved internally. Follow up in April to start the Bloom onboarding process. Also noted: they're considering adding winter activities (ice skating, northern lights tours) - could be a good case study.",
      bodyPreview: "Customer mentioned they want to start using Bloom for marketing next quarter...",
      summary: "Bloom upsell opportunity confirmed for next quarter with internal budget approved. Follow up in April. Also exploring winter activity expansion (ice skating, northern lights) which could serve as a case study.",
      timestamp: daysAgo(25),
      owner: "1",
    },
    {
      type: "email",
      title: "Invoice clarification",
      body: "Hi Anna,\n\nJust wanted to confirm the updated billing after your plan upgrade last week. Your new MRR is 2,400 kr (up from 1,800 kr) which includes the Pro tier features: advanced analytics, priority support, and custom domain.\n\nThe first invoice at the new rate will go out on the 1st. Let me know if you have any questions!\n\nBest,\nFilip",
      bodyPreview: "Hi Anna, Just wanted to confirm the updated billing after your plan upgrade...",
      summary: "Confirmed MRR increase from 1,800 kr to 2,400 kr after Pro tier upgrade. New features include advanced analytics, priority support, and custom domain. Next invoice at new rate on the 1st.",
      timestamp: daysAgo(45),
      direction: "OUTBOUND",
      fromEmail: "filip@understory.io",
      toEmail: "anna@acmeadventures.se",
    },
  ] as Engagement[],
  tasks: [
    {
      subject: "Send Bloom intro materials",
      status: "NOT_STARTED",
      dueDate: "2026-03-30T10:00:00.000Z",
      owner: "1",
    },
    {
      subject: "Follow up on payment integration",
      status: "IN_PROGRESS",
      dueDate: "2026-03-26T10:00:00.000Z",
      owner: "1",
    },
    {
      subject: "Schedule Q2 review",
      status: "NOT_STARTED",
      dueDate: "2026-04-06T10:00:00.000Z",
      owner: "2",
    },
  ] as TaskItem[],
  owners: {
    "1": "Filip K.",
    "2": "Anna S.",
  },
  stages: {
    stage_active: "Active Customer",
    stage_onboarding: "Onboarding",
    stage_churned: "Churned",
  },
  recap: {
    summary: "Last interaction was a quarterly check-in call 3 days ago. Customer expects 40% booking growth this summer and requested a group booking demo. They are happy with Understory Pay but want better failed payment reporting. Outstanding: send group booking beta docs and schedule follow-up demo.",
    suggestedAction: {
      text: "Send group booking beta documentation and schedule a demo for next week",
      type: "task" as const,
    },
  },
};

// overdue_invoices: company 101 has high revenue (daysOverdue 3), company 102 has low revenue (daysOverdue 14)
// Sorting by revenue desc: 101, 102. Sorting by daysOverdue desc: 102, 101 — different order.
//
// overdue_tasks: company 103 has high revenue (€5 000) but low daysOverdue (2)
//               company 104 has mid revenue (€3 500) and mid daysOverdue (8)
//               company 105 has low revenue (€15 000) but high daysOverdue (15)
// Sort by revenue desc: 105, 103, 104. Sort by daysOverdue desc: 105, 104, 103 — different order.
const MOCK_ATTENTION: AttentionResponse = {
  groups: [
    {
      signal: "overdue_invoices",
      label: "Overdue Invoices",
      companies: [
        { id: "101", name: "Nordic Kayak Tours", detail: "Nordic Kayak - Pro", ownerId: "1", mrr: "\u20ac25 000", currency: "EUR", daysOverdue: 3, enteredGroupAt: undefined },
        { id: "102", name: "Copenhagen Food Walks", detail: "Food Walks - Starter", ownerId: "2", mrr: "\u20ac8 000", currency: "EUR", daysOverdue: 14, enteredGroupAt: undefined },
      ],
    },
    {
      signal: "overdue_tasks",
      label: "Overdue Tasks",
      companies: [
        { id: "103", name: "Stockholm Adventures", detail: "Send onboarding materials", ownerId: "1", daysOverdue: 2, mrr: "\u20ac5 000", currency: "EUR", enteredGroupAt: daysAgoISO(2) },
        { id: "104", name: "Malmo Workshops", detail: "Schedule Q1 review", ownerId: "2", daysOverdue: 8, mrr: "\u20ac3 500", currency: "EUR", enteredGroupAt: daysAgoISO(8) },
        { id: "105", name: "Gothenburg Experiences", detail: "Follow up on payment setup", ownerId: "1", daysOverdue: 15, mrr: "\u20ac15 000", currency: "EUR", enteredGroupAt: daysAgoISO(15) },
      ],
    },
    {
      signal: "health_score",
      label: "Health Score Issues",
      companies: [
        { id: "106", name: "Bergen Outdoor Co", detail: "28", ownerId: "1", mrr: "\u20ac10 000", currency: "EUR", previousCategory: "45", categoryChangedAt: "2026-03-18T10:00:00.000Z", enteredGroupAt: "2026-03-18T10:00:00.000Z" },
        { id: "107", name: "Helsinki Tasting Club", detail: "42", ownerId: "2", mrr: "\u20ac30 000", currency: "EUR", previousCategory: "68", categoryChangedAt: "2026-03-10T14:00:00.000Z", enteredGroupAt: "2026-03-10T14:00:00.000Z" },
      ],
    },
    {
      signal: "gone_quiet",
      label: "Gone Quiet",
      companies: [
        { id: "108", name: "Oslo Creative Labs", detail: "Last contacted 62 days ago", ownerId: "2", daysSilent: 62, mrr: "\u20ac15 000", currency: "EUR", enteredGroupAt: daysAgoISO(62) },
        { id: "109", name: "Aarhus Adventure Park", detail: "Last contacted 51 days ago", ownerId: "1", daysSilent: 51, mrr: "\u20ac12 000", currency: "EUR", enteredGroupAt: daysAgoISO(51) },
        { id: "110", name: "Tampere Escape Rooms", detail: "Last contacted 48 days ago", ownerId: "1", daysSilent: 48, mrr: "\u20ac9 000", currency: "EUR", enteredGroupAt: daysAgoISO(48) },
      ],
    },
  ],
  updatedAt: "2026-03-23T12:00:00.000Z",
};

export default function Preview() {
  const [showData, setShowData] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [focusedAttentionIndex, setFocusedAttentionIndex] = useState(-1);
  const [focusedTabItemIndex, setFocusedTabItemIndex] = useState(-1);
  const [sortField, setSortField] = useState<"mrr" | "daysOverdue">("mrr");
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleLoadMock(company?: CompanySearchResult) {
    if (company) {
      addRecentCompany({ id: company.id, name: company.name, revenue: "€3 072", healthScore: "Monitor" });
    }
    setShowLoading(true);
    setShowData(false);
    setFocusedAttentionIndex(-1);
    setTimeout(() => {
      setShowLoading(false);
      setShowData(true);
    }, 1000);
  }

  useEffect(() => {
    const items = document.querySelectorAll("[data-attention-item]");
    items.forEach((el) => el.classList.remove("attention-item-focused"));
    if (focusedAttentionIndex >= 0 && focusedAttentionIndex < items.length) {
      items[focusedAttentionIndex].classList.add("attention-item-focused");
      items[focusedAttentionIndex].scrollIntoView({ block: "nearest" });
    }
  }, [focusedAttentionIndex]);

  useEffect(() => {
    const items = document.querySelectorAll("[data-tab-item]");
    items.forEach((el) => el.classList.remove("tab-item-focused"));
    if (focusedTabItemIndex >= 0 && focusedTabItemIndex < items.length) {
      const target = items[focusedTabItemIndex];
      target.classList.add("tab-item-focused");
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedTabItemIndex]);

  useEffect(() => {
    if (!showData) setFocusedTabItemIndex(-1);
  }, [showData]);

  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onBack: () => {
      if (showHelp) {
        setShowHelp(false);
      } else if (showData) {
        setShowData(false);
        setShowLoading(false);
      }
    },
    onNavigate: (direction) => {
      if (showData) {
        const total = document.querySelectorAll("[data-tab-item]").length;
        if (total === 0) return;
        setFocusedTabItemIndex((prev) => {
          if (direction === "down") return Math.min(prev + 1, total - 1);
          return Math.max(prev - 1, 0);
        });
        return;
      }
      const items = document.querySelectorAll("[data-attention-item]");
      const count = items.length;
      if (count === 0) return;
      setFocusedAttentionIndex((prev) => {
        if (direction === "down") return Math.min(prev + 1, count - 1);
        return Math.max(prev - 1, 0);
      });
    },
    onSelect: () => {
      if (showData) {
        if (focusedTabItemIndex < 0) return;
        const items = document.querySelectorAll("[data-tab-item]");
        const target = items[focusedTabItemIndex] as HTMLElement | undefined;
        if (!target) return;
        const toggleBtn = target.querySelector<HTMLButtonElement>("button[class*='hover:underline']");
        if (toggleBtn) toggleBtn.click();
        return;
      }
      if (focusedAttentionIndex < 0) return;
      const items = document.querySelectorAll("[data-attention-item]");
      const target = items[focusedAttentionIndex] as HTMLElement | undefined;
      if (!target) return;
      const id = target.getAttribute("data-company-id");
      const name = target.getAttribute("data-company-name");
      if (id && name) {
        handleLoadMock({ id, name, domain: "" });
      }
    },
    onJumpToGroup: (index) => {
      if (showData) return;
      const groups = document.querySelectorAll("[data-attention-group]");
      if (index >= groups.length) return;
      const group = groups[index];
      group.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstItem = group.querySelector("[data-attention-item]");
      if (!firstItem) return;
      const allItems = Array.from(document.querySelectorAll("[data-attention-item]"));
      const itemIndex = allItems.indexOf(firstItem);
      if (itemIndex >= 0) setFocusedAttentionIndex(itemIndex);
    },
    onSwitchTab: (direction) => {
      if (!showData) return;
      const tabButtons = document.querySelectorAll<HTMLButtonElement>("[class*='border-b'] > button");
      if (tabButtons.length === 0) return;
      const activeIndex = Array.from(tabButtons).findIndex((b) =>
        b.className.includes("font-semibold")
      );
      const nextIndex = direction === "next"
        ? Math.min(activeIndex + 1, tabButtons.length - 1)
        : Math.max(activeIndex - 1, 0);
      tabButtons[nextIndex]?.click();
      setFocusedTabItemIndex(-1);
    },
    onToggleSort: () => {
      if (showData) return;
      setSortField((prev) => prev === "mrr" ? "daysOverdue" : "mrr");
    },
    onToggleHelp: () => setShowHelp((prev) => !prev),
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <nav className="bg-[var(--moss)] px-6 py-3 grid grid-cols-3 items-center">
        <button
          onClick={() => { setShowData(false); setShowLoading(false); }}
          className="flex items-center gap-2 justify-self-start hover:opacity-80 transition-opacity"
        >
          <img src="/understory-logo.png" alt="Understory" className="h-8 w-8 rounded" />
          <span className="text-white font-bold text-lg">Customer Dashboard</span>
        </button>
        <div className="justify-self-center w-full max-w-sm lg:max-w-md">
          <SearchBar
            ref={searchInputRef}
            onSelect={(c) => handleLoadMock(c)}
          />
        </div>
        <div />
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-4">
        {!showData && !showLoading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
                <p className="text-xs text-[var(--green-100)] mt-1">Preview with mock data</p>
              </div>
              <div className="flex items-center bg-[var(--light-grey)] rounded-[var(--border-radius)] p-1">
                <span className="text-xs text-gray-400 px-2">Sort:</span>
                <button
                  onClick={() => setSortField("mrr")}
                  className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                    sortField === "mrr"
                      ? "bg-[var(--moss)] text-white"
                      : "text-[var(--green-100)] hover:text-[var(--moss)]"
                  }`}
                >
                  Revenue
                </button>
                <button
                  onClick={() => setSortField("daysOverdue")}
                  className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                    sortField !== "mrr"
                      ? "bg-[var(--moss)] text-white"
                      : "text-[var(--green-100)] hover:text-[var(--moss)]"
                  }`}
                >
                  Urgency
                </button>
              </div>
            </div>

            {MOCK_ATTENTION.groups.map((group) => (
              <AttentionGroupComponent
                key={group.signal}
                group={group}
                onSelectCompany={(c: CompanySearchResult) => { handleLoadMock(c); }}
                sortField={sortField}
              />
            ))}
          </div>
        )}

        {showLoading && (
          <div>
            <div className="mb-4 animate-pulse">
              <div className="h-8 w-64 bg-[#e5e7eb] rounded mb-2" />
              <div className="h-4 w-96 bg-[#e5e7eb] rounded" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonRecap />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SkeletonBlock />
              <SkeletonBlock />
            </div>
          </div>
        )}

        {showData && (
          <>
            <button
              onClick={() => { setShowData(false); setShowLoading(false); }}
              className="flex items-center gap-1 text-sm text-[var(--green-100)] hover:text-[var(--moss)] transition-all duration-200 mb-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
              </svg>
              Back to overview
            </button>
            <CompanyHeader
              companyId="12345"
              company={MOCK_DATA.company}
              deal={MOCK_DATA.deal}
              owners={MOCK_DATA.owners}
            />
            <MetricCards
              company={MOCK_DATA.company}
              deal={MOCK_DATA.deal}
              previousCategory="At Risk"
            />
            <TabContainer
              tabs={[
                {
                  id: "overview",
                  label: "Overview",
                  content: (
                    <OverviewTab
                      company={MOCK_DATA.company}
                      deal={MOCK_DATA.deal}
                      owners={MOCK_DATA.owners}
                      stages={MOCK_DATA.stages}
                      recap={MOCK_DATA.recap}
                      companyId="12345"
                    />
                  ),
                },
                {
                  id: "activity",
                  label: "Activity",
                  content: (
                    <ActivityTab
                      engagements={MOCK_DATA.engagements}
                      owners={MOCK_DATA.owners}
                    />
                  ),
                },
                {
                  id: "tasks",
                  label: "Tasks",
                  content: (
                    <TasksTab
                      tasks={MOCK_DATA.tasks}
                      owners={MOCK_DATA.owners}
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </main>

      <ShortcutCheatSheet isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
