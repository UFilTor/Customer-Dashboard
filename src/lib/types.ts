export type FormatType =
  | "text"
  | "currency"
  | "number"
  | "date"
  | "link"
  | "percentage"
  | "badge"
  | "owner"
  | "invoiceStatus";

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
}

export interface CompanyDetail {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  engagements: Engagement[];
  tasks: TaskItem[];
}

export interface Engagement {
  type: "call" | "meeting" | "note" | "email";
  title: string;
  body: string;
  bodyPreview: string;
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
