import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPipelineRows,
  computeMeasureFromDataset,
  computeOwnerWorkload,
  indiaEndOfDayIso,
} from './analytics.ts';
import { parseWorkbook, type ParsedDataset } from './etl.ts';
import { getServerSupabase } from './supabase.ts';
import { DEFAULT_EVENT_MILESTONES, DEFAULT_EVENT_PACKAGES } from './v2-defaults.ts';
import {
  DEFAULT_TARGET_COMPANIES,
  DEFAULT_TEAM_MEMBERS,
  type SeedTeamMember,
} from './v3-defaults.ts';
import type {
  ActivationRow,
  BottleneckRow,
  CampaignChannel,
  CampaignPerfRow,
  CashBreakdown,
  CashMetrics,
  EventMilestoneRow,
  EventPackageRow,
  FunnelMetrics,
  IndustryPerfRow,
  MeasureSnapshot,
  OpportunityStage,
  OwnerWorkloadRow,
  PipelineOpportunityRow,
  TargetCompanyRow,
  TargetOutreachStatus,
  TargetVsActualRow,
  TaskCategory,
  TaskPriority,
  TaskRow,
  TaskStatus,
  TeamMemberRow,
  WhatsAppLogRow,
} from './types.ts';

interface LocalOverlay {
  appended_brands?: ParsedDataset['brands'];
  appended_contacts?: ParsedDataset['sponsor_contacts'];
  appended_opportunities?: ParsedDataset['partner_opportunities'];
  appended_opp_history: ParsedDataset['opportunity_history'];
  appended_campaigns: ParsedDataset['sponsor_campaigns'];
  tasks: TaskRow[];
  event_packages?: EventPackageRow[];
  event_milestones?: EventMilestoneRow[];
  target_companies?: TargetCompanyRow[];
  whatsapp_logs?: Array<WhatsAppLogRow & { idempotency_key?: string }>;
}

const LOCAL_STORE_PATH = path.join(process.cwd(), '.local-store.json');
let baseDatasetCache: ParsedDataset | null = null;

export const VALID_STAGES: OpportunityStage[] = [
  'prospecting',
  'contacted',
  'proposal_sent',
  'negotiating',
  'partner_confirmed',
  'lost',
  'withdrawn',
];

export const VALID_CHANNELS: CampaignChannel[] = [
  'email',
  'linkedin',
  'introduction',
  'web_inbound',
];

export const VALID_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];
export const VALID_TASK_PRIORITIES: TaskPriority[] = ['p0', 'p1', 'p2'];
export const VALID_TASK_CATEGORIES: TaskCategory[] = [
  'outreach',
  'closing',
  'collection',
  'event_ops',
  'creative_assets',
];

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key && !url.includes('your-project-ref') && !key.includes('your-supabase'));
}

function getBaseDataset(): ParsedDataset {
  if (!baseDatasetCache) {
    const xlsxPath = path.join(process.cwd(), 'data', 'Sponsor_Dataset.xlsx');
    baseDatasetCache = parseWorkbook(xlsxPath);
  }
  return baseDatasetCache;
}

function readLocalOverlay(): LocalOverlay {
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    return { appended_opp_history: [], appended_campaigns: [], tasks: [] };
  }
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalOverlay>;
    return {
      appended_brands: parsed.appended_brands ?? [],
      appended_contacts: parsed.appended_contacts ?? [],
      appended_opportunities: parsed.appended_opportunities ?? [],
      appended_opp_history: parsed.appended_opp_history ?? [],
      appended_campaigns: parsed.appended_campaigns ?? [],
      tasks: parsed.tasks ?? [],
      event_packages: parsed.event_packages,
      event_milestones: parsed.event_milestones,
      target_companies: parsed.target_companies,
      whatsapp_logs: parsed.whatsapp_logs,
    };
  } catch {
    return { appended_opp_history: [], appended_campaigns: [], tasks: [] };
  }
}

function writeLocalOverlay(overlay: LocalOverlay): void {
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(overlay, null, 2), 'utf8');
}

export function getMergedLocalDataset(): ParsedDataset {
  const base = getBaseDataset();
  const overlay = readLocalOverlay();
  return {
    ...base,
    brands: [...base.brands, ...(overlay.appended_brands ?? [])],
    sponsor_contacts: [...base.sponsor_contacts, ...(overlay.appended_contacts ?? [])],
    partner_opportunities: [...base.partner_opportunities, ...(overlay.appended_opportunities ?? [])],
    sponsor_campaigns: [...base.sponsor_campaigns, ...overlay.appended_campaigns],
    opportunity_history: [...base.opportunity_history, ...overlay.appended_opp_history],
  };
}

async function fetchDatasetFromSupabase(asOfDate?: string | null): Promise<ParsedDataset> {
  const supabase = getServerSupabase();
  const cutoff = asOfDate ? indiaEndOfDayIso(asOfDate) : null;

  const [evRes, tgtRes, brRes, scRes, siRes, bqRes, poRes, ohRes, actRes] = await Promise.all([
    supabase.from('event').select('*'),
    cutoff
      ? supabase.from('targets').select('*').lte('effective_at', cutoff)
      : supabase.from('targets').select('*'),
    cutoff
      ? supabase.from('brands').select('*').lte('created_at', cutoff)
      : supabase.from('brands').select('*'),
    supabase.from('sponsor_campaigns').select('*'),
    cutoff
      ? supabase.from('sponsor_interactions').select('*').lte('occurred_at', cutoff)
      : supabase.from('sponsor_interactions').select('*'),
    cutoff
      ? supabase.from('brand_qualification').select('*').lte('effective_at', cutoff)
      : supabase.from('brand_qualification').select('*'),
    cutoff
      ? supabase.from('partner_opportunities').select('*').lte('created_at', cutoff)
      : supabase.from('partner_opportunities').select('*'),
    cutoff
      ? supabase.from('opportunity_history').select('*').lte('effective_at', cutoff)
      : supabase.from('opportunity_history').select('*'),
    cutoff
      ? supabase.from('sponsor_activations').select('*').lte('linked_at', cutoff)
      : supabase.from('sponsor_activations').select('*'),
  ]);

  for (const res of [evRes, tgtRes, brRes, scRes, siRes, bqRes, poRes, ohRes, actRes]) {
    if (res.error) throw new Error(`Supabase query error: ${res.error.message}`);
  }

  return {
    event: evRes.data ?? [],
    targets: tgtRes.data ?? [],
    brands: brRes.data ?? [],
    sponsor_contacts: [],
    sponsor_campaigns: scRes.data ?? [],
    sponsor_interactions: siRes.data ?? [],
    brand_qualification: bqRes.data ?? [],
    partner_opportunities: poRes.data ?? [],
    opportunity_history: ohRes.data ?? [],
    sponsor_activations: actRes.data ?? [],
    stats: {
      rawInteractionRows: (siRes.data ?? []).length,
      dedupedInteractionRows: (siRes.data ?? []).length,
      rawQualificationRows: (bqRes.data ?? []).length,
      dedupedQualificationRows: (bqRes.data ?? []).length,
      rawOppHistoryRows: (ohRes.data ?? []).length,
      dedupedOppHistoryRows: (ohRes.data ?? []).length,
    },
  };
}

export async function getMeasureSnapshot(asOfDate?: string | null): Promise<MeasureSnapshot> {
  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    return computeMeasureFromDataset(dataset, 'local', asOfDate);
  }

  if (asOfDate) {
    const dataset = await fetchDatasetFromSupabase(asOfDate);
    return computeMeasureFromDataset(dataset, 'supabase', asOfDate);
  }

  const supabase = getServerSupabase();
  const [evRes, funnelRes, cashRes, cashBdRes, indRes, campRes, tgtRes, bnRes, actRes] =
    await Promise.all([
      supabase.from('event').select('*').limit(1).maybeSingle(),
      supabase.from('v_funnel').select('*').single(),
      supabase.from('v_cash').select('*').single(),
      supabase.from('v_cash_breakdown').select('*').single(),
      supabase.from('v_industry_perf').select('*'),
      supabase.from('v_campaign_perf').select('*'),
      supabase.from('v_targets_vs_actuals').select('*'),
      supabase.from('v_bottlenecks').select('*').limit(50),
      supabase.from('sponsor_activations').select('*').order('linked_at', { ascending: false }),
    ]);

  for (const res of [
    evRes,
    funnelRes,
    cashRes,
    cashBdRes,
    indRes,
    campRes,
    tgtRes,
    bnRes,
    actRes,
  ]) {
    if (res.error) {
      throw new Error(`Supabase view query failed: ${res.error.message}`);
    }
  }

  return {
    meta: {
      mode: 'supabase',
      event_name: evRes.data?.event_name ?? 'CampusFest 2025',
      history_start: evRes.data?.history_start ?? '2025-01-15',
      history_end: evRes.data?.history_end ?? '2025-04-20',
      as_of: null,
    },
    funnel: funnelRes.data as FunnelMetrics,
    cash: cashRes.data as CashMetrics,
    cash_breakdown: cashBdRes.data as CashBreakdown,
    industries: (indRes.data ?? []) as IndustryPerfRow[],
    campaigns: (campRes.data ?? []) as CampaignPerfRow[],
    targets: (tgtRes.data ?? []) as TargetVsActualRow[],
    bottlenecks: (bnRes.data ?? []) as BottleneckRow[],
    activations: (actRes.data ?? []) as ActivationRow[],
  };
}

export async function listPipelineOpportunities(opts?: {
  stage?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: PipelineOpportunityRow[]; total: number; mode: 'supabase' | 'local' }> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const stageFilter = opts?.stage && opts.stage !== 'all' ? opts.stage : null;
  const searchFilter = opts?.search?.trim().toLowerCase() || null;

  let rows: PipelineOpportunityRow[];
  let mode: 'supabase' | 'local';

  if (!isSupabaseConfigured()) {
    mode = 'local';
    rows = buildPipelineRows(getMergedLocalDataset());
  } else {
    mode = 'supabase';
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('v_latest_opportunity_state')
      .select('*')
      .order('effective_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch pipeline: ${error.message}`);
    rows = (data ?? []) as PipelineOpportunityRow[];
  }

  const filtered = rows.filter((r) => {
    if (stageFilter && r.stage !== stageFilter) return false;
    if (searchFilter) {
      const hay = `${r.brand_name} ${r.opportunity_name} ${r.originating_campaign_name} ${r.owner_name}`.toLowerCase();
      if (!hay.includes(searchFilter)) return false;
    }
    return true;
  });

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    mode,
  };
}

export async function getOpportunityAuditTrail(opportunityId: string) {
  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    return dataset.opportunity_history
      .filter((h) => h.opportunity_id === opportunityId)
      .sort((a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at));
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('opportunity_history')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('effective_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch opportunity history: ${error.message}`);
  return data ?? [];
}

export interface UpdateOpportunityInput {
  opportunity_id: string;
  stage: OpportunityStage;
  proposed_value_inr?: number;
  confirmed_value_inr?: number;
  collected_value_inr?: number;
  owner_name?: string;
  idempotency_key?: string;
}

export async function appendOpportunityUpdate(input: UpdateOpportunityInput) {
  if (!VALID_STAGES.includes(input.stage)) {
    throw new Error(`Invalid stage: ${input.stage}`);
  }

  const historyId = input.idempotency_key
    ? `OH_IDEMP_${input.idempotency_key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}`
    : `OH_USR_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    const existingDup = dataset.opportunity_history.find((h) => h.history_id === historyId);
    if (existingDup) {
      return { appended: existingDup, deduplicated: true };
    }

    const currentRows = buildPipelineRows(dataset);
    const current = currentRows.find((r) => r.opportunity_id === input.opportunity_id);
    if (!current) {
      throw new Error(`Opportunity ${input.opportunity_id} not found`);
    }

    const proposed = Math.max(0, Math.round(input.proposed_value_inr ?? current.proposed_value_inr));
    let confirmed = Math.max(
      0,
      Math.round(
        input.confirmed_value_inr ??
          (input.stage === 'partner_confirmed'
            ? current.confirmed_value_inr > 0
              ? current.confirmed_value_inr
              : proposed
            : 0)
      )
    );
    let collected = Math.max(0, Math.round(input.collected_value_inr ?? current.collected_value_inr));

    if (input.stage !== 'partner_confirmed') {
      confirmed = 0;
      collected = 0;
    } else if (collected > confirmed) {
      throw new Error('collected_value_inr cannot exceed confirmed_value_inr');
    }

    const newRow = {
      history_id: historyId,
      opportunity_id: current.opportunity_id,
      opportunity_name: current.opportunity_name,
      brand_id: current.brand_id,
      brand_name: current.brand_name,
      stage: input.stage,
      proposed_value_inr: proposed,
      confirmed_value_inr: confirmed,
      collected_value_inr: collected,
      owner_id: current.owner_id || 'T01',
      owner_name: input.owner_name?.trim() || current.owner_name,
      effective_at: new Date().toISOString(),
    };

    const overlay = readLocalOverlay();
    overlay.appended_opp_history.push(newRow);
    writeLocalOverlay(overlay);
    return { appended: newRow, deduplicated: false };
  }

  const supabase = getServerSupabase();
  const { data: existingDup } = await supabase
    .from('opportunity_history')
    .select('*')
    .eq('history_id', historyId)
    .maybeSingle();
  if (existingDup) {
    return { appended: existingDup, deduplicated: true };
  }

  const { data: current, error: curErr } = await supabase
    .from('v_latest_opportunity_state')
    .select('*')
    .eq('opportunity_id', input.opportunity_id)
    .maybeSingle();
  if (curErr) throw new Error(`Failed to lookup opportunity: ${curErr.message}`);
  if (!current) throw new Error(`Opportunity ${input.opportunity_id} not found`);

  const proposed = Math.max(0, Math.round(input.proposed_value_inr ?? current.proposed_value_inr));
  let confirmed = Math.max(
    0,
    Math.round(
      input.confirmed_value_inr ??
        (input.stage === 'partner_confirmed'
          ? current.confirmed_value_inr > 0
            ? current.confirmed_value_inr
            : proposed
          : 0)
    )
  );
  let collected = Math.max(0, Math.round(input.collected_value_inr ?? current.collected_value_inr));

  if (input.stage !== 'partner_confirmed') {
    confirmed = 0;
    collected = 0;
  } else if (collected > confirmed) {
    throw new Error('collected_value_inr cannot exceed confirmed_value_inr');
  }

  const newRow = {
    history_id: historyId,
    opportunity_id: current.opportunity_id,
    opportunity_name: current.opportunity_name,
    brand_id: current.brand_id,
    brand_name: current.brand_name,
    stage: input.stage,
    proposed_value_inr: proposed,
    confirmed_value_inr: confirmed,
    collected_value_inr: collected,
    owner_id: current.owner_id || 'T01',
    owner_name: input.owner_name?.trim() || current.owner_name,
    effective_at: new Date().toISOString(),
  };

  const { error: insErr } = await supabase.from('opportunity_history').insert(newRow);
  if (insErr) throw new Error(`Failed to append opportunity history: ${insErr.message}`);
  return { appended: newRow, deduplicated: false };
}

export async function listCampaignsWithMeta() {
  const snapshot = await getMeasureSnapshot(null);
  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    const metaMap = new Map(
      dataset.sponsor_campaigns.map((c) => [c.sponsor_campaign_id, c])
    );
    return {
      mode: 'local' as const,
      items: snapshot.campaigns.map((perf) => ({
        ...perf,
        objective: metaMap.get(perf.sponsor_campaign_id)?.objective ?? '',
        audience: metaMap.get(perf.sponsor_campaign_id)?.audience ?? '',
        planned_start_at: metaMap.get(perf.sponsor_campaign_id)?.planned_start_at ?? '',
        planned_end_at: metaMap.get(perf.sponsor_campaign_id)?.planned_end_at ?? '',
      })),
    };
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('sponsor_campaigns').select('*');
  if (error) throw new Error(`Failed to list campaigns: ${error.message}`);
  const metaMap = new Map((data ?? []).map((c) => [c.sponsor_campaign_id, c]));
  return {
    mode: 'supabase' as const,
    items: snapshot.campaigns.map((perf) => ({
      ...perf,
      objective: metaMap.get(perf.sponsor_campaign_id)?.objective ?? '',
      audience: metaMap.get(perf.sponsor_campaign_id)?.audience ?? '',
      planned_start_at: metaMap.get(perf.sponsor_campaign_id)?.planned_start_at ?? '',
      planned_end_at: metaMap.get(perf.sponsor_campaign_id)?.planned_end_at ?? '',
    })),
  };
}

export interface CreateCampaignInput {
  campaign_name: string;
  channel: CampaignChannel;
  objective: string;
  audience: string;
  owner_name: string;
  idempotency_key?: string;
}

export async function createCampaign(input: CreateCampaignInput) {
  if (!VALID_CHANNELS.includes(input.channel)) {
    throw new Error(`Invalid channel: ${input.channel}`);
  }
  const name = input.campaign_name.trim();
  const objective = input.objective.trim();
  const audience = input.audience.trim();
  const owner_name = input.owner_name.trim();
  if (!name || !objective || !audience || !owner_name) {
    throw new Error('campaign_name, objective, audience, and owner_name are required');
  }

  const now = new Date().toISOString();
  const end = new Date(Date.now() + 30 * 86_400_000).toISOString();

  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    const overlay = readLocalOverlay();
    if (input.idempotency_key) {
      const existing = dataset.sponsor_campaigns.find(
        (c) => c.sponsor_campaign_id === `SC_${input.idempotency_key}`
      );
      if (existing) return existing;
    }
    const nextNum = dataset.sponsor_campaigns.length + 1;
    const id = input.idempotency_key
      ? `SC_${input.idempotency_key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)}`
      : `SC${String(nextNum).padStart(2, '0')}`;

    const row = {
      sponsor_campaign_id: id,
      campaign_name: name,
      channel: input.channel,
      objective,
      audience,
      owner_id: 'T_USER',
      owner_name,
      planned_start_at: now,
      planned_end_at: end,
      created_at: now,
    };
    overlay.appended_campaigns.push(row);
    writeLocalOverlay(overlay);
    return row;
  }

  const supabase = getServerSupabase();
  const { count } = await supabase
    .from('sponsor_campaigns')
    .select('*', { count: 'exact', head: true });
  const id = `SC${String((count ?? 6) + 1).padStart(2, '0')}_${crypto.randomBytes(2).toString('hex')}`;
  const row = {
    sponsor_campaign_id: id,
    campaign_name: name,
    channel: input.channel,
    objective,
    audience,
    owner_id: 'T_USER',
    owner_name,
    planned_start_at: now,
    planned_end_at: end,
    created_at: now,
  };
  const { error } = await supabase.from('sponsor_campaigns').insert(row);
  if (error) throw new Error(`Failed to create campaign: ${error.message}`);
  return row;
}

export async function listTasks(opts?: { limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const sorted = [...overlay.tasks].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
    return {
      mode: 'local' as const,
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
    };
  }

  const supabase = getServerSupabase();
  const { data, count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  return {
    mode: 'supabase' as const,
    items: (data ?? []) as TaskRow[],
    total: count ?? (data ?? []).length,
  };
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  owner_name: string;
  due_date?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  package_id?: string | null;
  brand_id?: string | null;
  sponsor_campaign_id?: string | null;
  opportunity_id?: string | null;
  created_by?: 'user' | 'copilot';
  idempotency_key?: string;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  const title = input.title.trim();
  const owner_name = input.owner_name.trim();
  if (!title || !owner_name) {
    throw new Error('title and owner_name are required');
  }
  const status: TaskStatus = input.status ?? 'todo';
  if (!VALID_TASK_STATUSES.includes(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
  const priority: TaskPriority = input.priority ?? 'p1';
  if (!VALID_TASK_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid task priority: ${priority}`);
  }
  const category: TaskCategory = input.category ?? 'closing';
  if (!VALID_TASK_CATEGORIES.includes(category)) {
    throw new Error(`Invalid task category: ${category}`);
  }
  const dueDate = input.due_date?.trim() || null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error('due_date must be YYYY-MM-DD');
  }

  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    if (input.idempotency_key) {
      const dup = overlay.tasks.find(
        (t) => (t as TaskRow & { idempotency_key?: string }).idempotency_key === input.idempotency_key
      );
      if (dup) return dup;
    }
    const row: TaskRow & { idempotency_key?: string } = {
      id: crypto.randomUUID(),
      title,
      description: input.description?.trim() ?? '',
      owner_name,
      due_date: dueDate,
      status,
      priority,
      category,
      package_id: input.package_id || null,
      brand_id: input.brand_id || null,
      sponsor_campaign_id: input.sponsor_campaign_id || null,
      opportunity_id: input.opportunity_id || null,
      created_by: input.created_by ?? 'user',
      created_at: now,
      updated_at: now,
      ...(input.idempotency_key ? { idempotency_key: input.idempotency_key } : {}),
    };
    overlay.tasks.unshift(row);
    writeLocalOverlay(overlay);
    return row;
  }

  const supabase = getServerSupabase();
  if (input.idempotency_key) {
    const { data: dup } = await supabase
      .from('tasks')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (dup) return dup as TaskRow;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: input.description?.trim() ?? '',
      owner_name,
      due_date: dueDate,
      status,
      priority,
      category,
      package_id: input.package_id || null,
      brand_id: input.brand_id || null,
      sponsor_campaign_id: input.sponsor_campaign_id || null,
      opportunity_id: input.opportunity_id || null,
      created_by: input.created_by ?? 'user',
      idempotency_key: input.idempotency_key ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data as TaskRow;
}

export async function updateTaskStatus(
  id: string,
  updates: {
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: TaskCategory;
    title?: string;
    owner_name?: string;
    due_date?: string | null;
  }
): Promise<TaskRow> {
  if (updates.status && !VALID_TASK_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status: ${updates.status}`);
  }
  if (updates.priority && !VALID_TASK_PRIORITIES.includes(updates.priority)) {
    throw new Error(`Invalid priority: ${updates.priority}`);
  }
  if (updates.category && !VALID_TASK_CATEGORIES.includes(updates.category)) {
    throw new Error(`Invalid category: ${updates.category}`);
  }
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const idx = overlay.tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    const prev = overlay.tasks[idx];
    const next: TaskRow = {
      ...prev,
      status: updates.status ?? prev.status,
      priority: updates.priority ?? prev.priority ?? 'p1',
      category: updates.category ?? prev.category ?? 'closing',
      title: updates.title?.trim() || prev.title,
      owner_name: updates.owner_name?.trim() || prev.owner_name,
      due_date: updates.due_date !== undefined ? updates.due_date : prev.due_date,
      updated_at: now,
    };
    overlay.tasks[idx] = next;
    writeLocalOverlay(overlay);
    return next;
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('tasks')
    .update({
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.priority ? { priority: updates.priority } : {}),
      ...(updates.category ? { category: updates.category } : {}),
      ...(updates.title ? { title: updates.title.trim() } : {}),
      ...(updates.owner_name ? { owner_name: updates.owner_name.trim() } : {}),
      ...(updates.due_date !== undefined ? { due_date: updates.due_date } : {}),
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data as TaskRow;
}

export async function deleteTask(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    overlay.tasks = overlay.tasks.filter((t) => t.id !== id);
    writeLocalOverlay(overlay);
    return;
  }
  const supabase = getServerSupabase();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete task: ${error.message}`);
}

export async function listReferenceOptions() {
  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    return {
      brands: dataset.brands
        .map((b) => ({ brand_id: b.brand_id, brand_name: b.brand_name }))
        .sort((a, b) => a.brand_name.localeCompare(b.brand_name)),
      campaigns: dataset.sponsor_campaigns.map((c) => ({
        sponsor_campaign_id: c.sponsor_campaign_id,
        campaign_name: c.campaign_name,
      })),
    };
  }
  const supabase = getServerSupabase();
  const [bRes, cRes] = await Promise.all([
    supabase.from('brands').select('brand_id, brand_name').order('brand_name'),
    supabase.from('sponsor_campaigns').select('sponsor_campaign_id, campaign_name'),
  ]);
  return {
    brands: bRes.data ?? [],
    campaigns: cRes.data ?? [],
  };
}


export async function getWorkforceWorkload(): Promise<{
  mode: 'supabase' | 'local';
  owners: OwnerWorkloadRow[];
}> {
  if (!isSupabaseConfigured()) {
    const dataset = getMergedLocalDataset();
    const overlay = readLocalOverlay();
    return {
      mode: 'local',
      owners: computeOwnerWorkload(dataset, overlay.tasks),
    };
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('v_owner_workload').select('*');
  if (error) throw new Error(`Failed to fetch owner workload: ${error.message}`);
  return {
    mode: 'supabase',
    owners: (data ?? []) as OwnerWorkloadRow[],
  };
}

export async function listEventPackages(): Promise<{
  mode: 'supabase' | 'local';
  packages: EventPackageRow[];
}> {
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    return {
      mode: 'local',
      packages: overlay.event_packages ?? DEFAULT_EVENT_PACKAGES,
    };
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('event_packages')
    .select('*')
    .order('list_price_inr', { ascending: false });
  if (error) throw new Error(`Failed to list event packages: ${error.message}`);
  const rows = (data ?? []) as EventPackageRow[];
  return {
    mode: 'supabase',
    packages: rows.length > 0 ? rows : DEFAULT_EVENT_PACKAGES,
  };
}

export async function reserveEventPackage(input: {
  package_id: string;
  opportunity_id: string;
  status?: 'reserved' | 'sold' | 'delivered';
}): Promise<{ package: EventPackageRow; tasksCreated: TaskRow[] }> {
  const nextStatus = input.status ?? 'reserved';
  const pipe = await listPipelineOpportunities({ limit: 200 });
  const opp = pipe.items.find((o) => o.opportunity_id === input.opportunity_id);
  if (!opp) throw new Error(`Opportunity ${input.opportunity_id} not found`);

  let updatedPkg: EventPackageRow;

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const pkgs = [...(overlay.event_packages ?? DEFAULT_EVENT_PACKAGES)];
    const idx = pkgs.findIndex((p) => p.package_id === input.package_id);
    if (idx === -1) throw new Error(`Package ${input.package_id} not found`);
    updatedPkg = {
      ...pkgs[idx],
      opportunity_id: opp.opportunity_id,
      status: nextStatus,
    };
    pkgs[idx] = updatedPkg;
    overlay.event_packages = pkgs;
    writeLocalOverlay(overlay);
  } else {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('event_packages')
      .update({ opportunity_id: opp.opportunity_id, status: nextStatus })
      .eq('package_id', input.package_id)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to reserve package: ${error.message}`);
    updatedPkg = data as EventPackageRow;
  }

  const tasksCreated = await generateDealChecklist({
    opportunity_id: opp.opportunity_id,
    package_id: updatedPkg.package_id,
    created_by: 'user',
  });

  return { package: updatedPkg, tasksCreated };
}

export async function listEventMilestones(): Promise<{
  mode: 'supabase' | 'local';
  milestones: EventMilestoneRow[];
}> {
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    return {
      mode: 'local',
      milestones: overlay.event_milestones ?? DEFAULT_EVENT_MILESTONES,
    };
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('event_milestones')
    .select('*')
    .order('offset_days', { ascending: true });
  if (error) throw new Error(`Failed to list event milestones: ${error.message}`);
  const rows = (data ?? []) as EventMilestoneRow[];
  return {
    mode: 'supabase',
    milestones: rows.length > 0 ? rows : DEFAULT_EVENT_MILESTONES,
  };
}

export async function updateEventMilestoneStatus(
  milestoneId: string,
  status: EventMilestoneRow['status']
): Promise<EventMilestoneRow> {
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    throw new Error(`Invalid milestone status: ${status}`);
  }
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const list = [...(overlay.event_milestones ?? DEFAULT_EVENT_MILESTONES)];
    const idx = list.findIndex((m) => m.milestone_id === milestoneId);
    if (idx === -1) throw new Error(`Milestone ${milestoneId} not found`);
    list[idx] = { ...list[idx], status };
    overlay.event_milestones = list;
    writeLocalOverlay(overlay);
    return list[idx];
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('event_milestones')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('milestone_id', milestoneId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update milestone: ${error.message}`);
  return data as EventMilestoneRow;
}

export async function generateDealChecklist(input: {
  opportunity_id: string;
  package_id?: string | null;
  created_by?: 'user' | 'copilot';
}): Promise<TaskRow[]> {
  const pipe = await listPipelineOpportunities({ limit: 200 });
  const opp = pipe.items.find((o) => o.opportunity_id === input.opportunity_id);
  if (!opp) throw new Error(`Opportunity ${input.opportunity_id} not found`);

  const templates: Array<{
    key: string;
    title: string;
    due_date: string;
    priority: TaskPriority;
    category: TaskCategory;
    description: string;
  }> = [
    {
      key: 'adv',
      title: `Collect 50% advance invoice — ${opp.brand_name}`,
      due_date: '2025-03-29',
      priority: 'p0',
      category: 'collection',
      description: `Pull cash ahead of event for ${opp.opportunity_id} (proposed ₹${opp.proposed_value_inr.toLocaleString('en-IN')}).`,
    },
    {
      key: 'assets',
      title: `Collect brand logo & booth specs — ${opp.brand_name}`,
      due_date: '2025-04-02',
      priority: 'p1',
      category: 'creative_assets',
      description: `Lock print/stage creative assets and QR tracking links before T-7.`,
    },
    {
      key: 'settle',
      title: `100% pre-event cash settlement — ${opp.brand_name}`,
      due_date: '2025-04-05',
      priority: 'p0',
      category: 'collection',
      description: `Confirm bank receipt before CampusFest 2025 gates open (12 Apr).`,
    },
    {
      key: 'ops',
      title: `On-ground activation setup & check — ${opp.brand_name}`,
      due_date: '2025-04-11',
      priority: 'p1',
      category: 'event_ops',
      description: `Power, Wi-Fi, passes, and volunteer lead assigned for ${opp.brand_name}.`,
    },
  ];

  const created: TaskRow[] = [];
  for (const tpl of templates) {
    const task = await createTask({
      title: tpl.title,
      description: tpl.description,
      owner_name: opp.owner_name,
      due_date: tpl.due_date,
      priority: tpl.priority,
      category: tpl.category,
      package_id: input.package_id ?? null,
      brand_id: opp.brand_id,
      sponsor_campaign_id: opp.sponsor_campaign_id,
      opportunity_id: opp.opportunity_id,
      created_by: input.created_by ?? 'user',
      idempotency_key: `chk_${opp.opportunity_id}_${tpl.key}`,
    });
    created.push(task);
  }
  return created;
}


export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_TEAM_MEMBERS.map((m) => ({
      member_id: m.member_id,
      full_name: m.full_name,
      role: m.role,
      reports_to_id: m.reports_to_id,
      phone_e164: m.phone_e164,
      assigned_verticals: m.assigned_verticals,
      active: m.active,
    }));
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('team_members')
    .select('member_id, full_name, role, reports_to_id, phone_e164, assigned_verticals, active')
    .eq('active', true);
  if (error || !data || data.length === 0) {
    return DEFAULT_TEAM_MEMBERS.map(({ pin_code: _pin, ...rest }) => {
      void _pin;
      return rest;
    });
  }
  return data as TeamMemberRow[];
}

export async function authenticateMember(
  memberId: string,
  pin?: string,
  demoSwitch = false
): Promise<SeedTeamMember | null> {
  if (!isSupabaseConfigured()) {
    const found = DEFAULT_TEAM_MEMBERS.find((m) => m.member_id === memberId && m.active);
    if (!found) return null;
    if (demoSwitch && process.env.ENABLE_DEMO_ROLE_SWITCHER !== 'false') return found;
    return pin && found.pin_code === pin.trim() ? found : null;
  }

  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('member_id', memberId)
    .eq('active', true)
    .maybeSingle();
  const found = (data as SeedTeamMember | null) ??
    DEFAULT_TEAM_MEMBERS.find((m) => m.member_id === memberId && m.active) ??
    null;
  if (!found) return null;
  if (demoSwitch && process.env.ENABLE_DEMO_ROLE_SWITCHER !== 'false') return found;
  return pin && found.pin_code === pin.trim() ? found : null;
}

export async function findTeamMemberByPhone(phoneRaw: string): Promise<TeamMemberRow | null> {
  const normalized = phoneRaw.replace(/^whatsapp:/i, '').replace(/[\s-]/g, '');
  const members = await listTeamMembers();
  return (
    members.find(
      (m) => m.phone_e164 === normalized || m.phone_e164.endsWith(normalized.slice(-10))
    ) ?? null
  );
}

export async function listTargetCompanies(opts?: {
  package_id?: string | null;
  industry?: string | null;
  outreach_status?: string | null;
  assigned_to_member_id?: string | null;
}): Promise<{ mode: 'supabase' | 'local'; items: TargetCompanyRow[] }> {
  let rows: TargetCompanyRow[];
  let mode: 'supabase' | 'local';

  if (!isSupabaseConfigured()) {
    mode = 'local';
    const overlay = readLocalOverlay();
    rows = overlay.target_companies ?? DEFAULT_TARGET_COMPANIES;
  } else {
    mode = 'supabase';
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('target_companies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list target companies: ${error.message}`);
    rows = ((data ?? []) as TargetCompanyRow[]).length > 0
      ? (data as TargetCompanyRow[])
      : DEFAULT_TARGET_COMPANIES;
  }

  const filtered = rows.filter((r) => {
    if (opts?.package_id && opts.package_id !== 'all' && r.package_id !== opts.package_id) {
      return false;
    }
    if (opts?.industry && opts.industry !== 'all' && r.industry !== opts.industry) {
      return false;
    }
    if (
      opts?.outreach_status &&
      opts.outreach_status !== 'all' &&
      r.outreach_status !== opts.outreach_status
    ) {
      return false;
    }
    if (opts?.assigned_to_member_id && r.assigned_to_member_id !== opts.assigned_to_member_id) {
      return false;
    }
    return true;
  });

  return { mode, items: filtered };
}

export async function createTargetCompany(input: {
  company_name: string;
  industry: string;
  city?: string;
  package_id: string;
  fit_rationale: string;
  estimated_ticket_inr: number;
  contact_role_hint?: string;
  priority?: TaskPriority;
  assigned_to_member_id?: string | null;
}): Promise<TargetCompanyRow> {
  const company_name = input.company_name.trim();
  const fit_rationale = input.fit_rationale.trim();
  if (!company_name || !fit_rationale || !input.package_id) {
    throw new Error('company_name, package_id, and fit_rationale are required');
  }

  const row: TargetCompanyRow = {
    target_id: `TC_${Date.now().toString().slice(-6)}_${crypto.randomBytes(2).toString('hex')}`,
    company_name,
    industry: input.industry.trim() || 'Consumer products',
    city: input.city?.trim() || 'Delhi NCR',
    package_id: input.package_id,
    fit_rationale,
    estimated_ticket_inr: Math.max(0, Math.round(input.estimated_ticket_inr || 0)),
    contact_role_hint: input.contact_role_hint?.trim() || 'Brand Marketing Lead',
    priority: input.priority ?? 'p1',
    outreach_status: input.assigned_to_member_id ? 'assigned' : 'shortlisted',
    assigned_to_member_id: input.assigned_to_member_id || null,
    promoted_brand_id: null,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const list = [...(overlay.target_companies ?? DEFAULT_TARGET_COMPANIES)];
    list.unshift(row);
    overlay.target_companies = list;
    writeLocalOverlay(overlay);
    return row;
  }

  const supabase = getServerSupabase();
  const { error } = await supabase.from('target_companies').insert(row);
  if (error) throw new Error(`Failed to create target company: ${error.message}`);
  return row;
}

export async function updateTargetCompany(
  targetId: string,
  updates: {
    outreach_status?: TargetOutreachStatus;
    assigned_to_member_id?: string | null;
  }
): Promise<TargetCompanyRow> {
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const list = [...(overlay.target_companies ?? DEFAULT_TARGET_COMPANIES)];
    const idx = list.findIndex((t) => t.target_id === targetId);
    if (idx === -1) throw new Error(`Target company ${targetId} not found`);
    list[idx] = {
      ...list[idx],
      ...(updates.outreach_status ? { outreach_status: updates.outreach_status } : {}),
      ...(updates.assigned_to_member_id !== undefined
        ? { assigned_to_member_id: updates.assigned_to_member_id }
        : {}),
    };
    overlay.target_companies = list;
    writeLocalOverlay(overlay);
    return list[idx];
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('target_companies')
    .update({
      ...(updates.outreach_status ? { outreach_status: updates.outreach_status } : {}),
      ...(updates.assigned_to_member_id !== undefined
        ? { assigned_to_member_id: updates.assigned_to_member_id }
        : {}),
    })
    .eq('target_id', targetId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update target company: ${error.message}`);
  return data as TargetCompanyRow;
}

export async function promoteTargetToPipeline(
  targetId: string,
  promoterName: string
): Promise<{ target: TargetCompanyRow; brand_id: string; opportunity_id: string }> {
  const targetsRes = await listTargetCompanies();
  const target = targetsRes.items.find((t) => t.target_id === targetId);
  if (!target) throw new Error(`Target company ${targetId} not found`);
  if (target.outreach_status === 'promoted' && target.promoted_brand_id) {
    return {
      target,
      brand_id: target.promoted_brand_id,
      opportunity_id: `O_${target.target_id}`,
    };
  }

  const members = await listTeamMembers();
  const assignee =
    members.find((m) => m.member_id === target.assigned_to_member_id) ??
    members.find((m) => m.full_name === promoterName) ??
    members[0];

  const brandId = `A_TGT_${target.target_id}`;
  const contactId = `SCON_TGT_${target.target_id}`;
  const oppId = `O_${target.target_id}`;
  const histId = `OH_TGT_${target.target_id}_1`;
  const now = new Date().toISOString();

  const brandRow = {
    brand_id: brandId,
    brand_name: target.company_name,
    industry: target.industry,
    owner_id: assignee.member_id,
    owner_name: assignee.full_name,
    created_at: now,
  };
  const contactRow = {
    contact_id: contactId,
    brand_id: brandId,
    brand_name: target.company_name,
    contact_name: `${target.company_name} Partnerships`,
    job_title: target.contact_role_hint,
    created_at: now,
  };
  const oppRow = {
    opportunity_id: oppId,
    opportunity_name: `${target.company_name} festival partnership`,
    brand_id: brandId,
    brand_name: target.company_name,
    primary_contact_id: contactId,
    primary_contact_name: contactRow.contact_name,
    sponsor_campaign_id: 'SC02',
    originating_campaign_name: 'Warm Partner Introductions',
    support_type: 'cash',
    created_at: now,
  };
  const histRow = {
    history_id: histId,
    opportunity_id: oppId,
    opportunity_name: oppRow.opportunity_name,
    brand_id: brandId,
    brand_name: target.company_name,
    stage: 'prospecting',
    proposed_value_inr: target.estimated_ticket_inr,
    confirmed_value_inr: 0,
    collected_value_inr: 0,
    owner_id: assignee.member_id,
    owner_name: assignee.full_name,
    effective_at: now,
  };

  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    overlay.appended_brands = [...(overlay.appended_brands ?? []), brandRow];
    overlay.appended_contacts = [...(overlay.appended_contacts ?? []), contactRow];
    overlay.appended_opportunities = [...(overlay.appended_opportunities ?? []), oppRow];
    overlay.appended_opp_history.push(histRow);

    const list = [...(overlay.target_companies ?? DEFAULT_TARGET_COMPANIES)];
    const idx = list.findIndex((t) => t.target_id === targetId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        outreach_status: 'promoted',
        promoted_brand_id: brandId,
      };
    }
    overlay.target_companies = list;
    writeLocalOverlay(overlay);
    return { target: list[idx] ?? target, brand_id: brandId, opportunity_id: oppId };
  }

  const supabase = getServerSupabase();
  const bIns = await supabase.from('brands').insert(brandRow);
  if (bIns.error) throw new Error(`Failed promoting to brands: ${bIns.error.message}`);
  const cIns = await supabase.from('sponsor_contacts').insert(contactRow);
  if (cIns.error) throw new Error(`Failed promoting to sponsor_contacts: ${cIns.error.message}`);
  const oIns = await supabase.from('partner_opportunities').insert(oppRow);
  if (oIns.error) throw new Error(`Failed promoting to partner_opportunities: ${oIns.error.message}`);
  const hIns = await supabase.from('opportunity_history').insert(histRow);
  if (hIns.error) throw new Error(`Failed promoting to opportunity_history: ${hIns.error.message}`);
  const { data: updatedTgt, error: tgtErr } = await supabase
    .from('target_companies')
    .update({ outreach_status: 'promoted', promoted_brand_id: brandId })
    .eq('target_id', targetId)
    .select('*')
    .single();
  if (tgtErr) throw new Error(`Failed updating target status: ${tgtErr.message}`);
  return { target: updatedTgt as TargetCompanyRow, brand_id: brandId, opportunity_id: oppId };
}

export async function listWhatsAppLogs(limit = 50): Promise<WhatsAppLogRow[]> {
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    return [...(overlay.whatsapp_logs ?? [])]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('whatsapp_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list WhatsApp logs: ${error.message}`);
  return (data ?? []) as WhatsAppLogRow[];
}

export async function recordWhatsAppLog(input: {
  direction: 'outbound' | 'inbound';
  member_id: string | null;
  phone_e164: string;
  message_body: string;
  related_task_id?: string | null;
  provider_status: string;
  idempotency_key?: string;
}): Promise<WhatsAppLogRow> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const overlay = readLocalOverlay();
    const logs = [...(overlay.whatsapp_logs ?? [])];
    if (input.idempotency_key) {
      const dup = logs.find((l) => l.idempotency_key === input.idempotency_key);
      if (dup) return dup;
    }
    const row: WhatsAppLogRow & { idempotency_key?: string } = {
      id: crypto.randomUUID(),
      direction: input.direction,
      member_id: input.member_id,
      phone_e164: input.phone_e164,
      message_body: input.message_body,
      related_task_id: input.related_task_id ?? null,
      provider_status: input.provider_status,
      created_at: now,
      ...(input.idempotency_key ? { idempotency_key: input.idempotency_key } : {}),
    };
    logs.unshift(row);
    overlay.whatsapp_logs = logs.slice(0, 200);
    writeLocalOverlay(overlay);
    return row;
  }

  const supabase = getServerSupabase();
  if (input.idempotency_key) {
    const { data: dup } = await supabase
      .from('whatsapp_logs')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (dup) return dup as WhatsAppLogRow;
  }
  const { data, error } = await supabase
    .from('whatsapp_logs')
    .insert({
      direction: input.direction,
      member_id: input.member_id,
      phone_e164: input.phone_e164,
      message_body: input.message_body,
      related_task_id: input.related_task_id ?? null,
      provider_status: input.provider_status,
      idempotency_key: input.idempotency_key ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to record WhatsApp log: ${error.message}`);
  return data as WhatsAppLogRow;
}
