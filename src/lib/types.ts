export type OpportunityStage =
  | 'prospecting'
  | 'contacted'
  | 'proposal_sent'
  | 'negotiating'
  | 'partner_confirmed'
  | 'lost'
  | 'withdrawn';

export type QualificationStatus =
  | 'unreviewed'
  | 'engaged'
  | 'qualified'
  | 'unqualified'
  | 'dormant';

export type CampaignChannel = 'email' | 'linkedin' | 'introduction' | 'web_inbound';

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'p0' | 'p1' | 'p2';
export type TaskCategory = 'outreach' | 'closing' | 'collection' | 'event_ops' | 'creative_assets';
export type TeamRole = 'head' | 'manager' | 'coordinator';
export type TargetOutreachStatus = 'shortlisted' | 'assigned' | 'contacted' | 'promoted' | 'archived';

export interface FunnelMetrics {
  researched_brands: number;
  outreach_sent_brands: number;
  engaged_or_qualified_brands: number;
  meeting_held_brands: number;
  qualified_brands: number;
  opportunity_brands: number;
  confirmed_brands: number;
}

export interface CashMetrics {
  confirmed_count: number;
  confirmed_value_inr: number;
  collected_value_inr: number;
  avg_confirmed_deal_inr: number;
  open_count: number;
  open_pipeline_inr: number;
  withdrawn_count: number;
  withdrawn_value_inr: number;
  lost_count: number;
  lost_value_inr: number;
}

export interface CampaignPerfRow {
  sponsor_campaign_id: string;
  campaign_name: string;
  channel: CampaignChannel;
  owner_name: string;
  interactions: number;
  brands_reached: number;
  meetings_held_brands: number;
  opportunities_created: number;
  confirmed_deals: number;
  confirmed_value_inr: number;
  open_deals: number;
  open_pipeline_inr: number;
  inr_per_interaction: number;
}

export interface TargetVsActualRow {
  target_version: string;
  effective_at: string;
  qualified_brands_goal: number;
  confirmed_partnerships_goal: number;
  actual_qualified_brands: number;
  actual_confirmed_partnerships: number;
  qualified_variance: number;
  confirmed_variance: number;
  is_latest: boolean;
}

export interface BottleneckRow {
  opportunity_id: string;
  opportunity_name: string;
  brand_id: string;
  brand_name: string;
  stage: OpportunityStage;
  proposed_value_inr: number;
  originating_campaign_name: string;
  owner_name: string;
  effective_at: string;
  days_in_stage: number;
}

export interface PipelineOpportunityRow {
  opportunity_id: string;
  opportunity_name: string;
  brand_id: string;
  brand_name: string;
  primary_contact_id: string;
  primary_contact_name: string;
  sponsor_campaign_id: string;
  originating_campaign_name: string;
  support_type: 'cash' | 'in_kind';
  stage: OpportunityStage;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  collected_value_inr: number;
  owner_id: string;
  owner_name: string;
  effective_at: string;
  history_id: string;
}

export interface ActivationRow {
  activation_id: string;
  brand_id: string;
  brand_name: string;
  opportunity_id: string;
  opportunity_name: string;
  attendee_campaign_id: string;
  attendee_campaign_name: string;
  activation_note: string;
  linked_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  owner_name: string;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  package_id: string | null;
  brand_id: string | null;
  sponsor_campaign_id: string | null;
  opportunity_id: string | null;
  created_by: 'user' | 'copilot';
  created_at: string;
  updated_at: string;
}

export interface CashBreakdown {
  confirmed_cash_count: number;
  confirmed_cash_inr: number;
  confirmed_in_kind_count: number;
  confirmed_in_kind_inr: number;
  collected_cash_inr: number;
  open_pipeline_inr: number;
}

export interface IndustryPerfRow {
  industry: string;
  total_brands: number;
  confirmed_deals: number;
  confirmed_value_inr: number;
  open_deals: number;
  open_pipeline_inr: number;
}

export interface OwnerWorkloadRow {
  owner_id: string;
  owner_name: string;
  brands_owned: number;
  interactions_count: number;
  email_interactions_count: number;
  open_opps_count: number;
  open_pipeline_inr: number;
  confirmed_deals_count: number;
  confirmed_value_inr: number;
  collected_value_inr: number;
  open_tasks_count: number;
  overdue_tasks_count: number;
}

export interface EventPackageRow {
  package_id: string;
  package_name: string;
  iit_inspiration: string;
  tier: 'title' | 'powered_by' | 'category_zone' | 'activation_booth';
  target_industry: string;
  list_price_inr: number;
  slots_total: number;
  event_day: 'day_1' | 'day_2' | 'both';
  opportunity_id: string | null;
  status: 'available' | 'reserved' | 'sold' | 'delivered';
  deliverables_summary: string;
}

export interface EventMilestoneRow {
  milestone_id: string;
  code: string;
  title: string;
  offset_days: number;
  due_date: string;
  category: 'pipeline' | 'packaging' | 'collection' | 'event_ops' | 'settlement';
  status: 'pending' | 'in_progress' | 'completed';
  notes: string;
}

export interface TeamMemberRow {
  member_id: string;
  full_name: string;
  role: TeamRole;
  reports_to_id: string | null;
  phone_e164: string;
  assigned_verticals: string[];
  active: boolean;
}

export interface SessionPrincipal {
  member_id: string;
  full_name: string;
  role: TeamRole;
  assigned_verticals: string[];
}

export interface TargetCompanyRow {
  target_id: string;
  company_name: string;
  industry: string;
  city: string;
  package_id: string;
  fit_rationale: string;
  estimated_ticket_inr: number;
  contact_role_hint: string;
  priority: TaskPriority;
  outreach_status: TargetOutreachStatus;
  assigned_to_member_id: string | null;
  promoted_brand_id: string | null;
  created_at: string;
}

export interface WhatsAppLogRow {
  id: string;
  direction: 'outbound' | 'inbound';
  member_id: string | null;
  phone_e164: string;
  message_body: string;
  related_task_id: string | null;
  provider_status: string;
  created_at: string;
}

export interface MeasureSnapshot {
  meta: {
    mode: 'supabase' | 'local';
    event_name: string;
    history_start: string;
    history_end: string;
    as_of: string | null;
  };
  funnel: FunnelMetrics;
  cash: CashMetrics;
  cash_breakdown: CashBreakdown;
  industries: IndustryPerfRow[];
  campaigns: CampaignPerfRow[];
  targets: TargetVsActualRow[];
  bottlenecks: BottleneckRow[];
  activations: ActivationRow[];
}
