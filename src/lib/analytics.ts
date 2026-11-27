import type { ParsedDataset } from './etl.ts';
import { latestByEntity } from './etl.ts';
import type {
  BottleneckRow,
  CampaignChannel,
  CampaignPerfRow,
  CashBreakdown,
  CashMetrics,
  FunnelMetrics,
  IndustryPerfRow,
  MeasureSnapshot,
  OpportunityStage,
  OwnerWorkloadRow,
  PipelineOpportunityRow,
  QualificationStatus,
  TargetVsActualRow,
  TaskRow,
} from './types.ts';

const OPEN_STAGES = new Set<OpportunityStage>([
  'prospecting',
  'contacted',
  'proposal_sent',
  'negotiating',
]);

/**
 * Converts a YYYY-MM-DD India date to the UTC ISO instant for 23:59:59.999+05:30.
 */
export function indiaEndOfDayIso(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid asOf date "${dateStr}" (expected YYYY-MM-DD)`);
  }
  return new Date(`${trimmed}T23:59:59.999+05:30`).toISOString();
}

export function computeMeasureFromDataset(
  dataset: ParsedDataset,
  mode: 'supabase' | 'local',
  asOfDate?: string | null
): MeasureSnapshot {
  const asOfIso = asOfDate ? indiaEndOfDayIso(asOfDate) : undefined;
  const cutoffMs = asOfIso ? Date.parse(asOfIso) : Number.POSITIVE_INFINITY;

  const eligibleBrands = dataset.brands.filter((b) => Date.parse(b.created_at) <= cutoffMs);
  const eligibleInteractions = dataset.sponsor_interactions.filter(
    (i) => Date.parse(i.occurred_at) <= cutoffMs
  );
  const eligibleOpps = dataset.partner_opportunities.filter(
    (o) => Date.parse(o.created_at) <= cutoffMs
  );

  const latestQual = latestByEntity(dataset.brand_qualification, (q) => q.brand_id, asOfIso);
  const latestOpp = latestByEntity(dataset.opportunity_history, (o) => o.opportunity_id, asOfIso);

  const qualValues = Array.from(latestQual.values());
  const oppValues = Array.from(latestOpp.values());

  const funnel: FunnelMetrics = {
    researched_brands: new Set(eligibleBrands.map((b) => b.brand_id)).size,
    outreach_sent_brands: new Set(
      eligibleInteractions
        .filter((i) => i.event_type === 'outreach_sent')
        .map((i) => i.brand_id)
    ).size,
    engaged_or_qualified_brands: new Set(
      qualValues
        .filter((q) =>
          (['engaged', 'qualified'] as QualificationStatus[]).includes(
            q.qualification_status as QualificationStatus
          )
        )
        .map((q) => q.brand_id)
    ).size,
    meeting_held_brands: new Set(
      eligibleInteractions
        .filter((i) => i.event_type === 'meeting_held')
        .map((i) => i.brand_id)
    ).size,
    qualified_brands: new Set(
      qualValues.filter((q) => q.qualification_status === 'qualified').map((q) => q.brand_id)
    ).size,
    opportunity_brands: new Set(eligibleOpps.map((o) => o.brand_id)).size,
    confirmed_brands: new Set(
      oppValues.filter((o) => o.stage === 'partner_confirmed').map((o) => o.brand_id)
    ).size,
  };

  const confirmedOpps = oppValues.filter((o) => o.stage === 'partner_confirmed');
  const openOpps = oppValues.filter((o) => OPEN_STAGES.has(o.stage as OpportunityStage));
  const withdrawnOpps = oppValues.filter((o) => o.stage === 'withdrawn');
  const lostOpps = oppValues.filter((o) => o.stage === 'lost');

  const confirmed_value_inr = confirmedOpps.reduce((s, o) => s + o.confirmed_value_inr, 0);
  const collected_value_inr = confirmedOpps.reduce((s, o) => s + o.collected_value_inr, 0);

  const cash: CashMetrics = {
    confirmed_count: confirmedOpps.length,
    confirmed_value_inr,
    collected_value_inr,
    avg_confirmed_deal_inr:
      confirmedOpps.length > 0 ? Math.round(confirmed_value_inr / confirmedOpps.length) : 0,
    open_count: openOpps.length,
    open_pipeline_inr: openOpps.reduce((s, o) => s + o.proposed_value_inr, 0),
    withdrawn_count: withdrawnOpps.length,
    withdrawn_value_inr: withdrawnOpps.reduce((s, o) => s + o.proposed_value_inr, 0),
    lost_count: lostOpps.length,
    lost_value_inr: lostOpps.reduce((s, o) => s + o.proposed_value_inr, 0),
  };

  const oppOriginMap = new Map(eligibleOpps.map((o) => [o.opportunity_id, o]));

  const confirmedCashOpps = confirmedOpps.filter(
    (o) => oppOriginMap.get(o.opportunity_id)?.support_type !== 'in_kind'
  );
  const confirmedInKindOpps = confirmedOpps.filter(
    (o) => oppOriginMap.get(o.opportunity_id)?.support_type === 'in_kind'
  );
  const cash_breakdown: CashBreakdown = {
    confirmed_cash_count: confirmedCashOpps.length,
    confirmed_cash_inr: confirmedCashOpps.reduce((s, o) => s + o.confirmed_value_inr, 0),
    confirmed_in_kind_count: confirmedInKindOpps.length,
    confirmed_in_kind_inr: confirmedInKindOpps.reduce((s, o) => s + o.confirmed_value_inr, 0),
    collected_cash_inr: confirmedCashOpps.reduce((s, o) => s + o.collected_value_inr, 0),
    open_pipeline_inr: cash.open_pipeline_inr,
  };

  const brandIndustryMap = new Map(eligibleBrands.map((b) => [b.brand_id, b.industry]));
  const indAgg = new Map<string, IndustryPerfRow>();
  for (const b of eligibleBrands) {
    const cur = indAgg.get(b.industry) ?? {
      industry: b.industry,
      total_brands: 0,
      confirmed_deals: 0,
      confirmed_value_inr: 0,
      open_deals: 0,
      open_pipeline_inr: 0,
    };
    cur.total_brands += 1;
    indAgg.set(b.industry, cur);
  }
  for (const o of oppValues) {
    const ind = brandIndustryMap.get(o.brand_id) ?? 'Other';
    const cur = indAgg.get(ind) ?? {
      industry: ind,
      total_brands: 0,
      confirmed_deals: 0,
      confirmed_value_inr: 0,
      open_deals: 0,
      open_pipeline_inr: 0,
    };
    if (o.stage === 'partner_confirmed') {
      cur.confirmed_deals += 1;
      cur.confirmed_value_inr += o.confirmed_value_inr;
    } else if (OPEN_STAGES.has(o.stage as OpportunityStage)) {
      cur.open_deals += 1;
      cur.open_pipeline_inr += o.proposed_value_inr;
    }
    indAgg.set(ind, cur);
  }
  const industries: IndustryPerfRow[] = Array.from(indAgg.values()).sort(
    (a, b) => b.confirmed_value_inr - a.confirmed_value_inr || b.open_pipeline_inr - a.open_pipeline_inr
  );

  const campaigns: CampaignPerfRow[] = dataset.sponsor_campaigns
    .map((c) => {
      const campInteractions = eligibleInteractions.filter(
        (i) => i.sponsor_campaign_id === c.sponsor_campaign_id
      );
      const campCreatedOpps = eligibleOpps.filter(
        (o) => o.sponsor_campaign_id === c.sponsor_campaign_id
      );
      const campOppStates = oppValues.filter(
        (o) => oppOriginMap.get(o.opportunity_id)?.sponsor_campaign_id === c.sponsor_campaign_id
      );
      const campConfirmed = campOppStates.filter((o) => o.stage === 'partner_confirmed');
      const campOpen = campOppStates.filter((o) => OPEN_STAGES.has(o.stage as OpportunityStage));
      const confirmedVal = campConfirmed.reduce((s, o) => s + o.confirmed_value_inr, 0);
      const interactionsCount = campInteractions.length;

      return {
        sponsor_campaign_id: c.sponsor_campaign_id,
        campaign_name: c.campaign_name,
        channel: c.channel as CampaignChannel,
        owner_name: c.owner_name,
        interactions: interactionsCount,
        brands_reached: new Set(campInteractions.map((i) => i.brand_id)).size,
        meetings_held_brands: new Set(
          campInteractions.filter((i) => i.event_type === 'meeting_held').map((i) => i.brand_id)
        ).size,
        opportunities_created: campCreatedOpps.length,
        confirmed_deals: campConfirmed.length,
        confirmed_value_inr: confirmedVal,
        open_deals: campOpen.length,
        open_pipeline_inr: campOpen.reduce((s, o) => s + o.proposed_value_inr, 0),
        inr_per_interaction: interactionsCount > 0 ? Math.round(confirmedVal / interactionsCount) : 0,
      };
    })
    .sort(
      (a, b) =>
        b.confirmed_value_inr - a.confirmed_value_inr ||
        b.open_pipeline_inr - a.open_pipeline_inr ||
        b.interactions - a.interactions
    );

  const eligibleTargets = [...dataset.targets]
    .filter((t) => Date.parse(t.effective_at) <= cutoffMs)
    .sort((a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at));

  const latestTargetVersion = eligibleTargets[0]?.target_version ?? null;
  const targets: TargetVsActualRow[] = eligibleTargets.map((t) => ({
    target_version: t.target_version,
    effective_at: t.effective_at,
    qualified_brands_goal: t.qualified_brands_goal,
    confirmed_partnerships_goal: t.confirmed_partnerships_goal,
    actual_qualified_brands: funnel.qualified_brands,
    actual_confirmed_partnerships: cash.confirmed_count,
    qualified_variance: funnel.qualified_brands - t.qualified_brands_goal,
    confirmed_variance: cash.confirmed_count - t.confirmed_partnerships_goal,
    is_latest: t.target_version === latestTargetVersion,
  }));

  const ev = dataset.event[0];
  const historyEndMs = ev ? Date.parse(`${ev.history_end}T23:59:59.999+05:30`) : Date.now();
  const maxOppMs = oppValues.reduce((m, o) => Math.max(m, Date.parse(o.effective_at)), 0);
  const anchorMs = asOfIso ? cutoffMs : Math.max(historyEndMs, maxOppMs);

  const bottlenecks: BottleneckRow[] = openOpps
    .map((o) => {
      const origin = oppOriginMap.get(o.opportunity_id);
      const effMs = Date.parse(o.effective_at);
      const daysInStage = Math.max(0, Math.floor((anchorMs - effMs) / 86_400_000));
      return {
        opportunity_id: o.opportunity_id,
        opportunity_name: o.opportunity_name,
        brand_id: o.brand_id,
        brand_name: o.brand_name,
        stage: o.stage as OpportunityStage,
        proposed_value_inr: o.proposed_value_inr,
        originating_campaign_name: origin?.originating_campaign_name ?? 'Unknown',
        owner_name: o.owner_name,
        effective_at: o.effective_at,
        days_in_stage: daysInStage,
      };
    })
    .sort((a, b) => b.days_in_stage - a.days_in_stage || b.proposed_value_inr - a.proposed_value_inr);

  const activations = dataset.sponsor_activations.filter(
    (a) => Date.parse(a.linked_at) <= cutoffMs
  );

  return {
    meta: {
      mode,
      event_name: ev?.event_name ?? 'CampusFest 2025',
      history_start: ev?.history_start ?? '2025-01-15',
      history_end: ev?.history_end ?? '2025-04-20',
      as_of: asOfDate ?? null,
    },
    funnel,
    cash,
    cash_breakdown,
    industries,
    campaigns,
    targets,
    bottlenecks,
    activations,
  };
}

export function computeOwnerWorkload(
  dataset: ParsedDataset,
  tasks: TaskRow[]
): OwnerWorkloadRow[] {
  const latestOpp = latestByEntity(dataset.opportunity_history, (o) => o.opportunity_id);
  const owners = new Map<string, OwnerWorkloadRow>();

  const ensureOwner = (ownerId: string, ownerName: string): OwnerWorkloadRow => {
    const existing = owners.get(ownerId);
    if (existing) return existing;
    const row: OwnerWorkloadRow = {
      owner_id: ownerId,
      owner_name: ownerName,
      brands_owned: 0,
      interactions_count: 0,
      email_interactions_count: 0,
      open_opps_count: 0,
      open_pipeline_inr: 0,
      confirmed_deals_count: 0,
      confirmed_value_inr: 0,
      collected_value_inr: 0,
      open_tasks_count: 0,
      overdue_tasks_count: 0,
    };
    owners.set(ownerId, row);
    return row;
  };

  for (const b of dataset.brands) {
    ensureOwner(b.owner_id, b.owner_name).brands_owned += 1;
  }
  for (const c of dataset.sponsor_campaigns) {
    ensureOwner(c.owner_id, c.owner_name);
  }
  for (const i of dataset.sponsor_interactions) {
    const ow = ensureOwner(i.owner_id, i.owner_id);
    ow.interactions_count += 1;
    if (i.channel === 'email') ow.email_interactions_count += 1;
  }
  for (const o of latestOpp.values()) {
    const ow = ensureOwner(o.owner_id, o.owner_name);
    if (o.stage === 'partner_confirmed') {
      ow.confirmed_deals_count += 1;
      ow.confirmed_value_inr += o.confirmed_value_inr;
      ow.collected_value_inr += o.collected_value_inr;
    } else if (OPEN_STAGES.has(o.stage as OpportunityStage)) {
      ow.open_opps_count += 1;
      ow.open_pipeline_inr += o.proposed_value_inr;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const match = Array.from(owners.values()).find(
      (o) => o.owner_name.toLowerCase() === t.owner_name.toLowerCase()
    );
    if (match) {
      match.open_tasks_count += 1;
      if (t.due_date && t.due_date < today) match.overdue_tasks_count += 1;
    }
  }

  return Array.from(owners.values()).sort(
    (a, b) => b.confirmed_value_inr - a.confirmed_value_inr || b.interactions_count - a.interactions_count
  );
}

export function buildPipelineRows(dataset: ParsedDataset): PipelineOpportunityRow[] {
  const latestOpp = latestByEntity(dataset.opportunity_history, (o) => o.opportunity_id);
  const oppMeta = new Map(dataset.partner_opportunities.map((o) => [o.opportunity_id, o]));

  return Array.from(latestOpp.values())
    .map((h) => {
      const meta = oppMeta.get(h.opportunity_id);
      return {
        opportunity_id: h.opportunity_id,
        opportunity_name: h.opportunity_name,
        brand_id: h.brand_id,
        brand_name: h.brand_name,
        primary_contact_id: meta?.primary_contact_id ?? '',
        primary_contact_name: meta?.primary_contact_name ?? '',
        sponsor_campaign_id: meta?.sponsor_campaign_id ?? '',
        originating_campaign_name: meta?.originating_campaign_name ?? '',
        support_type: (meta?.support_type ?? 'cash') as 'cash' | 'in_kind',
        stage: h.stage as OpportunityStage,
        proposed_value_inr: h.proposed_value_inr,
        confirmed_value_inr: h.confirmed_value_inr,
        collected_value_inr: h.collected_value_inr,
        owner_id: h.owner_id,
        owner_name: h.owner_name,
        effective_at: h.effective_at,
        history_id: h.history_id,
      };
    })
    .sort((a, b) => Date.parse(b.effective_at) - Date.parse(a.effective_at));
}
