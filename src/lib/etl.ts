import fs from 'node:fs';
import { createRequire } from 'node:module';
import type * as XLSXType from 'xlsx';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof XLSXType;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;

export function excelSerialToUtcIso(val: unknown): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const wallClockMs = Math.round((val - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
    return new Date(wallClockMs - IST_OFFSET_MS).toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num) && !val.includes('-')) {
      const wallClockMs = Math.round((num - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
      return new Date(wallClockMs - IST_OFFSET_MS).toISOString();
    }
    const parsed = new Date(val.trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  throw new Error(`Invalid date/timestamp value: ${String(val)}`);
}

export function excelSerialToDateString(val: unknown): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const wallClockMs = Math.round((val - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
    return new Date(wallClockMs).toISOString().slice(0, 10);
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return val.trim().slice(0, 10);
  }
  throw new Error(`Invalid date value: ${String(val)}`);
}

function asText(val: unknown, field: string): string {
  if (val === null || val === undefined) {
    throw new Error(`Missing required text field "${field}"`);
  }
  const s = String(val).trim();
  if (!s) {
    throw new Error(`Empty required text field "${field}"`);
  }
  return s;
}

function asNullableText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s ? s : null;
}

function asInt(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid integer value: ${String(val)}`);
  }
  return Math.round(n);
}

export interface ParsedDataset {
  event: Array<{
    event_name: string;
    history_start: string;
    history_end: string;
    event_starts_at: string;
    event_ends_at: string;
    timezone: string;
    currency: string;
    fictional: boolean;
  }>;
  targets: Array<{
    target_version: string;
    effective_at: string;
    qualified_brands_goal: number;
    confirmed_partnerships_goal: number;
  }>;
  brands: Array<{
    brand_id: string;
    brand_name: string;
    industry: string;
    owner_id: string;
    owner_name: string;
    created_at: string;
  }>;
  sponsor_contacts: Array<{
    contact_id: string;
    brand_id: string;
    brand_name: string;
    contact_name: string;
    job_title: string;
    created_at: string;
  }>;
  sponsor_campaigns: Array<{
    sponsor_campaign_id: string;
    campaign_name: string;
    channel: string;
    objective: string;
    audience: string;
    owner_id: string;
    owner_name: string;
    planned_start_at: string;
    planned_end_at: string;
    created_at: string;
  }>;
  sponsor_interactions: Array<{
    interaction_id: string;
    attempt_id: string;
    origin_interaction_id: string | null;
    brand_id: string;
    brand_name: string;
    contact_id: string;
    contact_name: string;
    sponsor_campaign_id: string;
    campaign_name: string;
    channel: string;
    event_type: string;
    outcome: string;
    summary: string;
    owner_id: string;
    occurred_at: string;
  }>;
  brand_qualification: Array<{
    history_id: string;
    brand_id: string;
    brand_name: string;
    qualification_status: string;
    reason: string;
    sponsor_campaign_id: string | null;
    source_campaign_name: string | null;
    effective_at: string;
  }>;
  partner_opportunities: Array<{
    opportunity_id: string;
    opportunity_name: string;
    brand_id: string;
    brand_name: string;
    primary_contact_id: string;
    primary_contact_name: string;
    sponsor_campaign_id: string;
    originating_campaign_name: string;
    support_type: string;
    created_at: string;
  }>;
  opportunity_history: Array<{
    history_id: string;
    opportunity_id: string;
    opportunity_name: string;
    brand_id: string;
    brand_name: string;
    stage: string;
    proposed_value_inr: number;
    confirmed_value_inr: number;
    collected_value_inr: number;
    owner_id: string;
    owner_name: string;
    effective_at: string;
  }>;
  sponsor_activations: Array<{
    activation_id: string;
    brand_id: string;
    brand_name: string;
    opportunity_id: string;
    opportunity_name: string;
    attendee_campaign_id: string;
    attendee_campaign_name: string;
    activation_note: string;
    linked_at: string;
  }>;
  stats: {
    rawInteractionRows: number;
    dedupedInteractionRows: number;
    rawQualificationRows: number;
    dedupedQualificationRows: number;
    rawOppHistoryRows: number;
    dedupedOppHistoryRows: number;
  };
}

function dedupByKey<T>(
  rows: T[],
  getKey: (row: T) => string
): { items: T[]; rawCount: number; dedupedCount: number } {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = getKey(row);
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return {
    items: Array.from(map.values()),
    rawCount: rows.length,
    dedupedCount: map.size,
  };
}

function readSheet(wb: XLSXType.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) {
    throw new Error(`Missing required sheet "${name}" in workbook`);
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

export function parseWorkbook(filePath: string): ParsedDataset {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', raw: true });

  const event = readSheet(wb, 'Event').map((r) => ({
    event_name: asText(r.event_name, 'event_name'),
    history_start: excelSerialToDateString(r.history_start),
    history_end: excelSerialToDateString(r.history_end),
    event_starts_at: excelSerialToUtcIso(r.event_starts_at),
    event_ends_at: excelSerialToUtcIso(r.event_ends_at),
    timezone: asText(r.timezone, 'timezone'),
    currency: asText(r.currency, 'currency'),
    fictional: Boolean(r.fictional),
  }));

  const targets = readSheet(wb, 'Targets').map((r) => ({
    target_version: asText(r.target_version, 'target_version'),
    effective_at: excelSerialToUtcIso(r.effective_at),
    qualified_brands_goal: asInt(r.qualified_brands_goal),
    confirmed_partnerships_goal: asInt(r.confirmed_partnerships_goal),
  }));

  const brands = readSheet(wb, 'Brands').map((r) => ({
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    industry: asText(r.industry, 'industry'),
    owner_id: asText(r.owner_id, 'owner_id'),
    owner_name: asText(r.owner_name, 'owner_name'),
    created_at: excelSerialToUtcIso(r.created_at),
  }));

  const sponsor_contacts = readSheet(wb, 'Sponsor contacts').map((r) => ({
    contact_id: asText(r.contact_id, 'contact_id'),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    contact_name: asText(r.contact_name, 'contact_name'),
    job_title: asText(r.job_title, 'job_title'),
    created_at: excelSerialToUtcIso(r.created_at),
  }));

  const sponsor_campaigns = readSheet(wb, 'Sponsor campaigns').map((r) => ({
    sponsor_campaign_id: asText(r.sponsor_campaign_id, 'sponsor_campaign_id'),
    campaign_name: asText(r.campaign_name, 'campaign_name'),
    channel: asText(r.channel, 'channel'),
    objective: asText(r.objective, 'objective'),
    audience: asText(r.audience, 'audience'),
    owner_id: asText(r.owner_id, 'owner_id'),
    owner_name: asText(r.owner_name, 'owner_name'),
    planned_start_at: excelSerialToUtcIso(r.planned_start_at),
    planned_end_at: excelSerialToUtcIso(r.planned_end_at),
    created_at: excelSerialToUtcIso(r.created_at),
  }));

  const rawInteractions = readSheet(wb, 'Sponsor interactions').map((r) => ({
    interaction_id: asText(r.interaction_id, 'interaction_id'),
    attempt_id: asText(r.attempt_id, 'attempt_id'),
    origin_interaction_id: asNullableText(r.origin_interaction_id),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    contact_id: asText(r.contact_id, 'contact_id'),
    contact_name: asText(r.contact_name, 'contact_name'),
    sponsor_campaign_id: asText(r.sponsor_campaign_id, 'sponsor_campaign_id'),
    campaign_name: asText(r.campaign_name, 'campaign_name'),
    channel: asText(r.channel, 'channel'),
    event_type: asText(r.event_type, 'event_type'),
    outcome: asText(r.outcome, 'outcome'),
    summary: asText(r.summary, 'summary'),
    owner_id: asText(r.owner_id, 'owner_id'),
    occurred_at: excelSerialToUtcIso(r.occurred_at),
  }));
  const dedupInteractions = dedupByKey(rawInteractions, (x) => x.interaction_id);

  const rawQuals = readSheet(wb, 'Brand qualification').map((r) => ({
    history_id: asText(r.history_id, 'history_id'),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    qualification_status: asText(r.qualification_status, 'qualification_status'),
    reason: asText(r.reason, 'reason'),
    sponsor_campaign_id: asNullableText(r.sponsor_campaign_id),
    source_campaign_name: asNullableText(r.source_campaign_name),
    effective_at: excelSerialToUtcIso(r.effective_at),
  }));
  const dedupQuals = dedupByKey(rawQuals, (x) => x.history_id);

  const partner_opportunities = readSheet(wb, 'Partner opportunities').map((r) => ({
    opportunity_id: asText(r.opportunity_id, 'opportunity_id'),
    opportunity_name: asText(r.opportunity_name, 'opportunity_name'),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    primary_contact_id: asText(r.primary_contact_id, 'primary_contact_id'),
    primary_contact_name: asText(r.primary_contact_name, 'primary_contact_name'),
    sponsor_campaign_id: asText(r.sponsor_campaign_id, 'sponsor_campaign_id'),
    originating_campaign_name: asText(r.originating_campaign_name, 'originating_campaign_name'),
    support_type: asText(r.support_type, 'support_type'),
    created_at: excelSerialToUtcIso(r.created_at),
  }));

  const rawOppHist = readSheet(wb, 'Opportunity history').map((r) => ({
    history_id: asText(r.history_id, 'history_id'),
    opportunity_id: asText(r.opportunity_id, 'opportunity_id'),
    opportunity_name: asText(r.opportunity_name, 'opportunity_name'),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    stage: asText(r.stage, 'stage'),
    proposed_value_inr: asInt(r.proposed_value_inr, 0),
    confirmed_value_inr: asInt(r.confirmed_value_inr, 0),
    collected_value_inr: 0,
    owner_id: asText(r.owner_id, 'owner_id'),
    owner_name: asText(r.owner_name, 'owner_name'),
    effective_at: excelSerialToUtcIso(r.effective_at),
  }));
  const dedupOppHist = dedupByKey(rawOppHist, (x) => x.history_id);

  const sponsor_activations = readSheet(wb, 'Sponsor activations').map((r) => ({
    activation_id: asText(r.activation_id, 'activation_id'),
    brand_id: asText(r.brand_id, 'brand_id'),
    brand_name: asText(r.brand_name, 'brand_name'),
    opportunity_id: asText(r.opportunity_id, 'opportunity_id'),
    opportunity_name: asText(r.opportunity_name, 'opportunity_name'),
    attendee_campaign_id: asText(r.attendee_campaign_id, 'attendee_campaign_id'),
    attendee_campaign_name: asText(r.attendee_campaign_name, 'attendee_campaign_name'),
    activation_note: asText(r.activation_note, 'activation_note'),
    linked_at: excelSerialToUtcIso(r.linked_at),
  }));

  return {
    event,
    targets,
    brands,
    sponsor_contacts,
    sponsor_campaigns,
    sponsor_interactions: dedupInteractions.items,
    brand_qualification: dedupQuals.items,
    partner_opportunities,
    opportunity_history: dedupOppHist.items,
    sponsor_activations,
    stats: {
      rawInteractionRows: dedupInteractions.rawCount,
      dedupedInteractionRows: dedupInteractions.dedupedCount,
      rawQualificationRows: dedupQuals.rawCount,
      dedupedQualificationRows: dedupQuals.dedupedCount,
      rawOppHistoryRows: dedupOppHist.rawCount,
      dedupedOppHistoryRows: dedupOppHist.dedupedCount,
    },
  };
}

export function latestByEntity<T extends { effective_at: string; history_id?: string }>(
  rows: T[],
  getEntityId: (row: T) => string,
  asOfIso?: string
): Map<string, T> {
  const cutoff = asOfIso ? Date.parse(asOfIso) : Number.POSITIVE_INFINITY;
  const latest = new Map<string, T>();

  for (const row of rows) {
    const ts = Date.parse(row.effective_at);
    if (ts > cutoff) continue;
    const id = getEntityId(row);
    const prev = latest.get(id);
    if (!prev) {
      latest.set(id, row);
      continue;
    }
    const prevTs = Date.parse(prev.effective_at);
    if (ts > prevTs || (ts === prevTs && (row.history_id ?? '') > (prev.history_id ?? ''))) {
      latest.set(id, row);
    }
  }
  return latest;
}

export interface SelfTestReport {
  passed: boolean;
  failures: string[];
  summary: {
    brands: number;
    contacts: number;
    campaigns: number;
    interactionsRaw: number;
    interactionsDeduped: number;
    qualifiedBrands: number;
    opportunityBrands: number;
    opportunitiesTotal: number;
    confirmedOpportunities: number;
    confirmedCashInr: number;
    openOpportunities: number;
    openPipelineInr: number;
    withdrawnOpportunities: number;
    withdrawnPipelineInr: number;
    lostOpportunities: number;
    lostPipelineInr: number;
    latestTargetVersion: string;
    latestQualifiedGoal: number;
    latestConfirmedGoal: number;
    campaignBreakdown: Array<{
      sponsor_campaign_id: string;
      campaign_name: string;
      channel: string;
      interactions: number;
      brands: number;
      confirmed: number;
      confirmed_inr: number;
    }>;
  };
}

export function runSelfTest(data: ParsedDataset, asOfIso?: string): SelfTestReport {
  const latestQual = latestByEntity(data.brand_qualification, (r) => r.brand_id, asOfIso);
  const latestOpp = latestByEntity(data.opportunity_history, (r) => r.opportunity_id, asOfIso);

  const qualifiedBrands = Array.from(latestQual.values()).filter(
    (q) => q.qualification_status === 'qualified'
  ).length;

  const oppRows = Array.from(latestOpp.values());
  const opportunityBrands = new Set(oppRows.map((o) => o.brand_id)).size;

  const confirmedOpps = oppRows.filter((o) => o.stage === 'partner_confirmed');
  const openOpps = oppRows.filter((o) =>
    ['prospecting', 'contacted', 'proposal_sent', 'negotiating'].includes(o.stage)
  );
  const withdrawnOpps = oppRows.filter((o) => o.stage === 'withdrawn');
  const lostOpps = oppRows.filter((o) => o.stage === 'lost');

  const confirmedCashInr = confirmedOpps.reduce((sum, o) => sum + o.confirmed_value_inr, 0);
  const openPipelineInr = openOpps.reduce((sum, o) => sum + o.proposed_value_inr, 0);
  const withdrawnPipelineInr = withdrawnOpps.reduce((sum, o) => sum + o.proposed_value_inr, 0);
  const lostPipelineInr = lostOpps.reduce((sum, o) => sum + o.proposed_value_inr, 0);

  const sortedTargets = [...data.targets].sort(
    (a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at)
  );
  const latestTarget = sortedTargets[0];

  const oppOriginMap = new Map(
    data.partner_opportunities.map((o) => [o.opportunity_id, o.sponsor_campaign_id])
  );

  const campaignBreakdown = data.sponsor_campaigns.map((c) => {
    const campInteractions = data.sponsor_interactions.filter(
      (i) => i.sponsor_campaign_id === c.sponsor_campaign_id
    );
    const campConfirmed = confirmedOpps.filter(
      (o) => oppOriginMap.get(o.opportunity_id) === c.sponsor_campaign_id
    );
    return {
      sponsor_campaign_id: c.sponsor_campaign_id,
      campaign_name: c.campaign_name,
      channel: c.channel,
      interactions: campInteractions.length,
      brands: new Set(campInteractions.map((i) => i.brand_id)).size,
      confirmed: campConfirmed.length,
      confirmed_inr: campConfirmed.reduce((s, o) => s + o.confirmed_value_inr, 0),
    };
  });

  const failures: string[] = [];
  if (data.brands.length !== 180) failures.push(`Expected 180 brands, got ${data.brands.length}`);
  if (data.sponsor_contacts.length !== 270) {
    failures.push(`Expected 270 contacts, got ${data.sponsor_contacts.length}`);
  }
  if (data.sponsor_campaigns.length !== 6) {
    failures.push(`Expected 6 campaigns, got ${data.sponsor_campaigns.length}`);
  }
  if (data.sponsor_interactions.length !== 950) {
    failures.push(`Expected 950 deduped interactions, got ${data.sponsor_interactions.length}`);
  }
  if (qualifiedBrands !== 60) {
    failures.push(`Expected 60 qualified brands, got ${qualifiedBrands}`);
  }
  if (confirmedOpps.length !== 24) {
    failures.push(`Expected 24 confirmed partnerships, got ${confirmedOpps.length}`);
  }
  if (confirmedCashInr !== 2_240_000) {
    failures.push(`Expected ₹2,240,000 confirmed cash, got ${confirmedCashInr}`);
  }
  if (openOpps.length !== 26) {
    failures.push(`Expected 26 open opportunities, got ${openOpps.length}`);
  }
  if (openPipelineInr !== 1_440_000) {
    failures.push(`Expected ₹1,440,000 open pipeline, got ${openPipelineInr}`);
  }
  if (withdrawnOpps.length !== 1 || withdrawnPipelineInr !== 80_000) {
    failures.push(
      `Expected 1 withdrawn (₹80,000), got ${withdrawnOpps.length} (₹${withdrawnPipelineInr})`
    );
  }
  if (lostOpps.length !== 7 || lostPipelineInr !== 780_000) {
    failures.push(`Expected 7 lost (₹780,000), got ${lostOpps.length} (₹${lostPipelineInr})`);
  }

  return {
    passed: failures.length === 0,
    failures,
    summary: {
      brands: data.brands.length,
      contacts: data.sponsor_contacts.length,
      campaigns: data.sponsor_campaigns.length,
      interactionsRaw: data.stats.rawInteractionRows,
      interactionsDeduped: data.stats.dedupedInteractionRows,
      qualifiedBrands,
      opportunityBrands,
      opportunitiesTotal: oppRows.length,
      confirmedOpportunities: confirmedOpps.length,
      confirmedCashInr,
      openOpportunities: openOpps.length,
      openPipelineInr,
      withdrawnOpportunities: withdrawnOpps.length,
      withdrawnPipelineInr,
      lostOpportunities: lostOpps.length,
      lostPipelineInr,
      latestTargetVersion: latestTarget?.target_version ?? 'unknown',
      latestQualifiedGoal: latestTarget?.qualified_brands_goal ?? 0,
      latestConfirmedGoal: latestTarget?.confirmed_partnerships_goal ?? 0,
      campaignBreakdown,
    },
  };
}
