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

export interface Recap {
  summary: string | null;
  suggestedAction: {
    text: string;
    type: ActionType;
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
}

export type AttentionSignal = "overdue_invoices" | "open_invoices" | "overdue_tasks" | "health_score" | "gone_quiet" | "declining_volume";

export interface AttentionGroup {
  signal: AttentionSignal;
  label: string;
  companies: AttentionCompany[];
}

export interface AttentionResponse {
  groups: AttentionGroup[];
  updatedAt: string;
}
