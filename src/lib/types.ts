export type FormatType =
  | "text"
  | "currency"
  | "number"
  | "date"
  | "link"
  | "percentage"
  | "badge"
  | "owner"
  | "invoiceStatus"
  | "revenue12m";

export interface FieldConfig {
  label: string;
  property: string;
  format: FormatType;
}

export interface MetricCardConfig extends FieldConfig {
  source: "company" | "deal";
}

export interface DashboardConfig {
  metricCards: MetricCardConfig[];
  tabs: {
    overview: {
      companyInfo: FieldConfig[];
      dealInfo: FieldConfig[];
    };
    activity: {
      types: string[];
      daysBack: number;
      emailSubjectFilter: string[];
    };
    tasks: {
      filter: string;
      fields: FieldConfig[];
    };
  };
}

export interface CompanySearchResult {
  id: string;
  name: string;
  domain: string;
  revenue?: string;
  healthScore?: string;
}

export interface CompanyDetail {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  engagements: Engagement[];
  tasks: TaskItem[];
  recap: Recap | null;
  /** Primary customer-side contact (name + clickable email/phone). Pulled
   *  from the deal's first associated contact, falling back to the company.
   *  Surfaced in the detail header so the CS owner has the call/email
   *  target without leaving the dashboard. */
  primaryContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface Engagement {
  type: "call" | "meeting" | "note" | "email";
  title: string;
  body: string;
  bodyPreview: string;
  summary: string;
  timestamp: string;
  direction?: string;
  status?: string;
  outcome?: string;
  owner?: string;
  fromEmail?: string;
  toEmail?: string;
}

export interface TaskItem {
  subject: string;
  status: string;
  dueDate: string;
  owner: string;
}

export interface OwnerMap {
  [id: string]: string;
}

export interface StageMap {
  [id: string]: string;
}

export type ActionType = "note" | "task" | "meeting" | "call";
export type RecapConfidence = "low" | "medium" | "high";

export interface Recap {
  summary: string | null;
  suggestedAction: {
    text: string;
    type: ActionType;
    confidence: RecapConfidence;
  } | null;
  error?: boolean;
}

export interface AttentionCompany {
  id: string;
  name: string;
  detail: string;
  ownerId?: string;
  mrr?: string;
  currency?: string;
  country?: string;
  daysOverdue?: number;
  previousCategory?: string;
  categoryChangedAt?: string;
  daysSilent?: number;
  enteredGroupAt?: string;
  healthScore?: string;
  volume12m?: number;
  volume3m?: number;
  volume6m?: number;
  payStatus?: string;
  plan?: string;
  lastContactedAt?: string;
  /** When the customer last *created* an event in their booking system —
   *  surfaced in the No Future Events row pill so the user knows how
   *  long ago they actually used the product, not just when CS reached
   *  out. Pulled from `understory_latest_event`. */
  latestEventAt?: string;
  revenue?: number;
  // Outstanding invoice amount aggregated across every open-invoice deal on the
  // company. `outstandingLocal` + `outstandingCurrency` are populated only when
  // every deal shares one currency (typical case); for mixed-currency companies
  // both are null and the EUR total is the only comparable figure.
  outstandingLocal?: number;
  outstandingCurrency?: string;
  outstandingEur?: number;
  // Sum of `number_of_open_invoices` across the company's open-invoice deals.
  openInvoiceCount?: number;
}

export type AttentionSignal = "overdue_invoices" | "open_invoices" | "health_score" | "no_future_events";

export interface AttentionGroup {
  signal: AttentionSignal;
  label: string;
  companies: AttentionCompany[];
}

export interface AttentionResponse {
  groups: AttentionGroup[];
  updatedAt: string;
}

// Pay Migration Dashboard

export type PayStage =
  | "Not yet enrolled"
  | "Signed - Not Started"
  | "Started Onboarding"
  | "Pending Verification"
  | "Verified"
  | "Live"
  | "Ineligible"
  | "Unwilling";

export interface PayDeal {
  dealId: string;
  companyId: string | null;
  dealName: string;
  stage: PayStage;
  rawPayStatus: string;
  bv: number;
  acv: number;
  plan: string;
  ownerId: string;
  ownerName: string;
  lastActivityDate: string | null;
  daysSinceActivity: number | null;
  unwillingReason: string | null;
  hasOpenInvoice: boolean;
  zeroEvents: boolean;
}

export interface PayOwnerSummary {
  ownerId: string;
  ownerName: string;
  lcPercent: number;
  inProgressPercent: number;
  arrPercent: number;
  eligibleBv: number;
  totalBv: number;
  stageCounts: Record<PayStage, { count: number; bv: number }>;
  deals: PayDeal[];
}

export interface PayMigrationData {
  bvLiveVerifiedPercent: number;
  bvInProgressPercent: number;
  arrLiveVerifiedPercent: number;
  aprilTarget: number;
  mayTarget: number;

  totalBv: number;
  totalAcv: number;
  eligibleBv: number;
  liveVerifiedBv: number;
  inProgressBv: number;
  ineligibleBv: number;
  liveVerifiedAcv: number;

  stageBreakdown: Record<PayStage, { count: number; bv: number }>;
  owners: PayOwnerSummary[];
  allOwnersSummary: PayOwnerSummary;
  needsAPush: PayDeal[];
  unwilling: PayDeal[];
  notEnrolled: PayDeal[];
  allDeals: PayDeal[];
  updatedAt: string;
}

// Onboarding Dashboard
//
// Source: Customer Lifecycle pipeline (166333631). Customers are "in onboarding"
// while customer_stage is not yet Established and not Churned.
// Step labels are derived from customer_stage; days-in-step from
// hs_v2_time_in_current_stage.

export type OnboardingStep =
  | "Adopted"
  | "Started"
  | "Hibernation"
  | "Product Hold"
  | "Other";

export type OnboardingRisk = "low" | "medium" | "high";

export interface OnboardingObNotes {
  customerNeeds: string | null;
  promisesMade: string | null;
  experiencesLink: string | null;
  growNotes: string | null;
}

export interface OnboardingObNotesExtended extends OnboardingObNotes {
  // From `enable_understory_pay` — true / false / null when not set.
  understoryPayEnabled: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyDomain: string | null;
  storefrontLink: string | null;
  payStatus: string | null;
}

export interface OnboardingCommercial {
  // All fields can be null if missing from HubSpot.
  monthlyFee: string | null;       // "X CCY/mo"
  acv: string | null;              // "X EUR"
  bookingFee: string | null;       // "X.XX%" — confirmed_booking_fee overrides booking_fee silently
  firstBilling: string | null;     // "YYYY-MM-DD"
  salesOwner: string | null;       // resolved owner name, or "missing" if no sales deal
}

export interface OnboardingMeeting {
  id: string;
  title: string;
  startsAt: string;          // ISO timestamp
  endsAt: string | null;
  body: string | null;       // hs_meeting_body — Gong summaries land here
  internalNotes: string | null;
  outcome: string | null;
  /** hs_activity_type — "Onboarding" / "Follow up meeting" / etc. */
  activityType: string | null;
  ownerId: string;
  ownerName: string | null;
}

/** Unified historical engagement (meeting / call / email-thread) shown in the meeting brief. */
export type OnboardingHistoryKind = "meeting" | "call" | "email";

/** A single email message within an email thread. */
export interface OnboardingEmailMessage {
  id: string;
  occurredAt: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND" | null;
  ownerName: string | null;
}

export interface OnboardingHistoryEntry {
  id: string;
  kind: OnboardingHistoryKind;
  title: string;             // meeting/call subject or normalised email subject
  occurredAt: string;        // ISO timestamp of the most recent message in this entry
  body: string | null;       // raw body — Gong summary / call notes / latest email body
  ownerId: string;
  ownerName: string | null;
  /** Most recent direction for emails, null otherwise. */
  direction: "INBOUND" | "OUTBOUND" | null;
  outcome: string | null;    // meetings/calls
  /** For emails: every message in the thread, sorted ASC by occurredAt. */
  thread?: OnboardingEmailMessage[];
}

export interface OnboardingDeal {
  dealId: string;
  companyId: string | null;
  companyName: string;
  ownerId: string;
  ownerName: string;
  country: string | null;
  plan: string | null;
  acv: number;          // annual contract value in EUR (from amount_in_home_currency)
  signedAt: string | null;
  step: OnboardingStep;
  customerStage: string;
  customerSubstage: string | null;
  daysInStep: number;
  expectedDaysInStep: number;
  riskLevel: OnboardingRisk;
  blockers: string[];
  hibernationNote: string | null;
  productHoldNote: string | null;
  obNotes: OnboardingObNotesExtended;
  commercial: OnboardingCommercial;
  selfOnboarding: boolean;
  lastTouch: string | null;
  /** Past meetings, calls, and emails on this deal — sorted DESC, filtered to "meaningful" entries
   * (meetings only count if they have a body or are Gong-tagged; emails skip auto-invites). */
  history: OnboardingHistoryEntry[];
}

/** A meeting on the calendar that we surface on the dashboard, paired with its account context. */
export interface OnboardingMeetingEntry {
  meeting: OnboardingMeeting;
  deal: OnboardingDeal;
}

export interface OnboardingResponse {
  deals: OnboardingDeal[];
  /** All meetings in [today 00:00, today + 7d), sorted ascending by start time. Client groups by day. */
  meetings: OnboardingMeetingEntry[];
  updatedAt: string;
}

// Natural-language Search dashboard
//
// Source of truth for the multi-target search pipeline. The LLM (Haiku) emits
// a SearchSpec from natural language; src/lib/search.ts validates it against
// per-entity field allowlists and translates each target into HubSpot
// filterGroups. Engagement targets resolve up to the parent company so click-
// through opens the existing CompanyDetail panel.

export type SearchEntityType =
  | "deal"
  | "company"
  | "note"
  | "meeting"
  | "call"
  | "email";

export type SearchOperator =
  | "EQ"
  | "NEQ"
  | "GT"
  | "LT"
  | "GTE"
  | "LTE"
  | "CONTAINS_TOKEN"
  | "IN"
  | "NOT_IN"
  | "HAS_PROPERTY"
  | "BETWEEN";

export interface SearchFilter {
  propertyName: string;
  operator: SearchOperator;
  /** For BETWEEN, "value" carries lower bound and "highValue" the upper. */
  value: string;
  highValue?: string;
}

export interface SearchTarget {
  entityType: SearchEntityType;
  /** AND-combined filters applied to every text-search OR branch. */
  filters: SearchFilter[];
  /** OR-fanned-out across the cartesian product of `terms` × `fields`. Each
   *  term should be a single CONTAINS_TOKEN-friendly word ("GYG", not "GYG
   *  getyourguide"); if the user gives synonyms, each one becomes its own
   *  term in the array. HubSpot caps at 5 filterGroups total, so we cap the
   *  fan-out at 5 too. */
  textSearch: { terms: string[]; fields: string[] } | null;
}

export interface SearchSpec {
  targets: SearchTarget[];
  /** Owner scope resolved from the active Filter pill (or restated by the user
   *  in NL — "in Cecilia's name"). "all" means no owner filter applied. */
  ownerScope: { kind: "person" | "region" | "all"; value?: string };
  limit: number;
}

export interface SearchSnippet {
  /** Which engagement type the snippet came from. */
  engagementType: "note" | "meeting" | "call" | "email";
  /** ISO timestamp of the engagement. */
  occurredAt: string;
  /** Body fragment around the matched term, ~200 chars centred on the match. */
  excerpt: string;
  /** HubSpot URL for the underlying engagement record. */
  hubspotUrl: string;
}

export interface SearchResult {
  /** Stable id — prefer companyId when resolvable, else `${entity}:${entityId}`. */
  id: string;
  /** Top-level kind of hit. Engagement-only hits (no company resolved) keep
   *  their engagement type so the row can still render usefully. */
  type: SearchEntityType;
  title: string;
  subtitle: string;
  /** When the hit resolved to a company, dashboard click opens the detail panel. */
  companyId: string | null;
  /** Always present so unresolved hits still link out. */
  hubspotUrl: string;
  /** Up to 3 engagement snippets attached to this company / hit. */
  snippets: SearchSnippet[];
  /** Recency score for ranking. Higher = newer. */
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  /** The spec the LLM produced for this turn — sent back so the client can
   *  pass it as `priorSpec` on the next refinement turn. */
  parsed: SearchSpec | null;
  latencyMs: number;
  error?: string;
}

/** One turn in the client's refinement chain. */
export interface SearchTurn {
  query: string;
  spec: SearchSpec | null;
  results: SearchResult[];
}
