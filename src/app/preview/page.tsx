"use client";

import { useState } from "react";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricCards } from "@/components/MetricCards";
import { TabContainer } from "@/components/TabContainer";
import { OverviewTab } from "@/components/OverviewTab";
import { ActivityTab } from "@/components/ActivityTab";
import { TasksTab } from "@/components/TasksTab";
import { SkeletonCard, SkeletonBlock, SkeletonRecap } from "@/components/Skeleton";
import { CompanyDetail, OwnerMap, StageMap, Engagement, TaskItem, AttentionResponse } from "@/lib/types";

interface CompanyData extends CompanyDetail {
  owners: OwnerMap;
  stages: StageMap;
}

const MOCK_DATA: CompanyData = {
  company: {
    name: "Acme Adventures AB",
    domain: "acmeadventures.se",
    hubspot_owner_id: "1",
    notes_last_contacted: "2026-03-21T10:00:00.000Z",
    understory_total_number_of_transactions: "847",
    understory_booking_volume_all_time: "412000",
    understory_booking_volume_last_12_months: "186000",
    "Health Score Category": "Good",
  },
  deal: {
    dealname: "Acme Adventures - Pro",
    dealstage: "stage_active",
    confirmed__contract_mrr: "2400",
    booking_fee: "3.5",
    understory_pay_status__customer: "Active",
    Tags: "Paid",
    pipeline: "lifecycle",
  },
  engagements: [
    {
      type: "call",
      title: "Quarterly check-in",
      body: "Discussed upcoming season preparations. Anna mentioned they're expecting 40% more bookings this summer compared to last year. They want to explore group booking functionality and asked about integrating with their existing CRM. We also talked about their experience with Understory Pay - they're happy with the conversion rates but want better reporting on failed payments. Action item: send them the group booking beta docs and schedule a follow-up demo.",
      bodyPreview: "Discussed upcoming season preparations. Anna mentioned they're expecting 40% more bookings...",
      summary: "Customer expects 40% booking growth this summer and wants group booking functionality. Happy with Understory Pay conversion but needs better failed payment reporting. Action items: send group booking beta docs, schedule follow-up demo.",
      timestamp: "1742569200000",
      direction: "OUTBOUND",
      status: "COMPLETED",
    },
    {
      type: "email",
      title: "Re: Booking page setup",
      body: "Hi Filip,\n\nThanks for the help with the booking page! The new layout looks great and we've already seen a 15% increase in completed bookings since we switched over last week.\n\nOne thing - could we add a map widget to the kayaking tour page? Customers keep asking where the meeting point is.\n\nAlso, quick question: is there a way to set different cancellation policies per experience type? We want stricter rules for the multi-day tours.\n\nBest,\nAnna",
      bodyPreview: "Hi Filip, Thanks for the help with the booking page! The new layout looks great...",
      summary: "Customer reports 15% increase in completed bookings after page redesign. Requesting two features: a map widget for meeting point locations and per-experience cancellation policy settings for multi-day tours.",
      timestamp: "1742396400000",
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
      timestamp: "1741791600000",
      outcome: "COMPLETED",
    },
    {
      type: "note",
      title: "Note",
      body: "Customer mentioned they want to start using Bloom for marketing next quarter. They've been doing their own email campaigns but want to leverage Understory's audience reach. Budget approved internally. Follow up in April to start the Bloom onboarding process. Also noted: they're considering adding winter activities (ice skating, northern lights tours) - could be a good case study.",
      bodyPreview: "Customer mentioned they want to start using Bloom for marketing next quarter...",
      summary: "Bloom upsell opportunity confirmed for next quarter with internal budget approved. Follow up in April. Also exploring winter activity expansion (ice skating, northern lights) which could serve as a case study.",
      timestamp: "1741618800000",
      owner: "1",
    },
    {
      type: "email",
      title: "Invoice clarification",
      body: "Hi Anna,\n\nJust wanted to confirm the updated billing after your plan upgrade last week. Your new MRR is 2,400 kr (up from 1,800 kr) which includes the Pro tier features: advanced analytics, priority support, and custom domain.\n\nThe first invoice at the new rate will go out on the 1st. Let me know if you have any questions!\n\nBest,\nFilip",
      bodyPreview: "Hi Anna, Just wanted to confirm the updated billing after your plan upgrade...",
      summary: "Confirmed MRR increase from 1,800 kr to 2,400 kr after Pro tier upgrade. New features include advanced analytics, priority support, and custom domain. Next invoice at new rate on the 1st.",
      timestamp: "1741100400000",
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

const MOCK_ATTENTION: AttentionResponse = {
  groups: [
    {
      signal: "overdue_invoices",
      label: "Overdue Invoices",
      companies: [
        { id: "101", name: "Nordic Kayak Tours", detail: "Nordic Kayak - Pro", ownerId: "1" },
        { id: "102", name: "Copenhagen Food Walks", detail: "Food Walks - Starter", ownerId: "2" },
      ],
    },
    {
      signal: "overdue_tasks",
      label: "Overdue Tasks",
      companies: [
        { id: "103", name: "Stockholm Adventures", detail: "Send onboarding materials (5d overdue)", ownerId: "1" },
        { id: "104", name: "Malmo Workshops", detail: "Schedule Q1 review (12d overdue)", ownerId: "2" },
        { id: "105", name: "Gothenburg Experiences", detail: "Follow up on payment setup (3d overdue)", ownerId: "1" },
      ],
    },
    {
      signal: "health_score",
      label: "Health Score Issues",
      companies: [
        { id: "106", name: "Bergen Outdoor Co", detail: "Critical Churn Risk", ownerId: "1" },
        { id: "107", name: "Helsinki Tasting Club", detail: "At Risk", ownerId: "2" },
      ],
    },
    {
      signal: "gone_quiet",
      label: "Gone Quiet",
      companies: [
        { id: "108", name: "Oslo Creative Labs", detail: "Last contacted 62 days ago", ownerId: "2" },
        { id: "109", name: "Aarhus Adventure Park", detail: "Last contacted 51 days ago", ownerId: "1" },
        { id: "110", name: "Tampere Escape Rooms", detail: "Last contacted 48 days ago", ownerId: "1" },
      ],
    },
  ],
  updatedAt: "2026-03-23T12:00:00.000Z",
};

export default function Preview() {
  const [showData, setShowData] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  function handleLoadMock() {
    setShowLoading(true);
    setShowData(false);
    setTimeout(() => {
      setShowLoading(false);
      setShowData(true);
    }, 1000);
  }

  return (
    <div className="min-h-screen bg-[var(--beige-new)]">
      {/* Top bar */}
      <nav className="bg-[var(--moss)] px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => { setShowData(false); setShowLoading(false); }}
          className="text-white font-bold text-lg hover:text-[var(--citrus)] transition-all duration-200"
        >
          Customer Dashboard
        </button>
        <div className="relative w-full max-w-md">
          <input
            type="text"
            defaultValue={showData ? "Acme Adventures AB" : ""}
            placeholder="Search company..."
            onFocus={handleLoadMock}
            className="w-full bg-white/15 text-white placeholder-white/50 rounded-[var(--border-radius)] px-4 py-2 outline-none focus:bg-white/20 transition-all duration-200"
          />
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {!showData && !showLoading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
                <p className="text-xs text-[var(--green-100)] mt-1">Preview with mock data</p>
              </div>
              <button
                onClick={handleLoadMock}
                className="bg-[var(--citrus)] text-[var(--moss)] px-4 py-2 rounded-[8px] text-sm font-semibold hover:bg-[var(--lichen)] transition-all duration-200"
              >
                Load company detail
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-6">
              <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
                <div className="text-[var(--green-100)] text-xs uppercase tracking-wide mb-1">Total</div>
                <div className="text-xl font-bold text-[var(--moss)]">{MOCK_ATTENTION.groups.reduce((s, g) => s + g.companies.length, 0)}</div>
              </div>
              {MOCK_ATTENTION.groups.map((g) => (
                <div key={g.signal} className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
                  <div className="text-[var(--green-100)] text-xs uppercase tracking-wide mb-1">{g.label}</div>
                  <div className={`text-xl font-bold ${(g.signal === "overdue_invoices" || g.signal === "overdue_tasks") && g.companies.length > 0 ? "text-[var(--rust)]" : "text-[var(--moss)]"}`}>
                    {g.companies.length}
                  </div>
                </div>
              ))}
            </div>

            {MOCK_ATTENTION.groups.map((group) => (
              <div key={group.signal} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-[var(--moss)]">{group.label}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    group.signal === "overdue_invoices" || group.signal === "overdue_tasks"
                      ? "bg-[var(--rust)] text-white"
                      : "bg-[var(--beige)] text-[var(--moss)]"
                  }`}>
                    {group.companies.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={handleLoadMock}
                      className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 flex items-center justify-between text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
                    >
                      <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
                      <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {showLoading && (
          <div>
            <div className="mb-4 animate-pulse">
              <div className="h-8 w-64 bg-[#e5e7eb] rounded mb-2" />
              <div className="h-4 w-96 bg-[#e5e7eb] rounded" />
            </div>
            <div className="grid grid-cols-5 gap-3 mb-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonRecap />
            <div className="grid grid-cols-2 gap-4">
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
              owners={MOCK_DATA.owners}
            />
            <MetricCards
              company={MOCK_DATA.company}
              deal={MOCK_DATA.deal}
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
    </div>
  );
}
