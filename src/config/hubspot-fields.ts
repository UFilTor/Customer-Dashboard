import { DashboardConfig } from "@/lib/types";

export const dashboardConfig: DashboardConfig = {
  metricCards: [
    { label: "Revenue last year", property: "understory_total_platform_fee_cents_received", source: "company", format: "revenue12m" },
    { label: "Last 12M Volume", property: "understory_booking_volume_12m", source: "company", format: "currency" },
    { label: "Understory Pay", property: "understory_pay_status__customer", source: "deal", format: "text" },
    { label: "Invoice", property: "unpaid_invoice", source: "deal", format: "invoiceStatus" },
    { label: "Health Score", property: "health_score", source: "company", format: "text" },
  ],
  tabs: {
    overview: {
      companyInfo: [
        { label: "Domain", property: "domain", format: "link" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
        { label: "Last contacted", property: "notes_last_contacted", format: "date" },
        { label: "Transactions", property: "understory_total_number_of_transactions", format: "number" },
        { label: "All-time volume", property: "understory_booking_volume_all_time", format: "currency" },
      ],
      dealInfo: [
        { label: "Deal name", property: "dealname", format: "text" },
        { label: "Stage", property: "dealstage", format: "badge" },
        { label: "MRR", property: "confirmed__contract_mrr", format: "currency" },
        { label: "Booking fee", property: "booking_fee", format: "percentage" },
        { label: "Understory Pay", property: "understory_pay_status__customer", format: "text" },
        { label: "Invoice status", property: "unpaid_invoice", format: "invoiceStatus" },
      ],
    },
    activity: {
      types: ["calls", "meetings", "notes", "emails"],
      daysBack: 90,
      emailSubjectFilter: ["Accepted:", "Tentative:", "Declined:"],
    },
    tasks: {
      filter: "future_due_dates",
      fields: [
        { label: "Subject", property: "hs_task_subject", format: "text" },
        { label: "Status", property: "hs_task_status", format: "badge" },
        { label: "Due date", property: "hs_task_due_date", format: "date" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
      ],
    },
  },
};
