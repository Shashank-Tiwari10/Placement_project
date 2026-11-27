import { Type, type FunctionDeclaration } from '@google/genai';
import { latestByEntity } from './etl.ts';
import { formatPct } from './format.ts';
import {
  getMeasureSnapshot,
  getMergedLocalDataset,
  getWorkforceWorkload,
  isSupabaseConfigured,
  listEventMilestones,
  listEventPackages,
  listPipelineOpportunities,
  listTargetCompanies,
  listTasks,
  VALID_STAGES,
} from './repository.ts';
import { getServerSupabase } from './supabase.ts';
import type { OpportunityStage, SessionPrincipal } from './types.ts';

export interface PendingCopilotAction {
  actionId: string;
  tool:
    | 'createTask'
    | 'updateOpportunityStage'
    | 'reassignOpportunityOwner'
    | 'reserveEventPackage'
    | 'generateDealChecklist';
  summary: string;
  payload: Record<string, unknown>;
}

export const READ_TOOL_NAMES = new Set([
  'getFunnel',
  'getCash',
  'getCashBreakdown',
  'getCampaignPerf',
  'getPipeline',
  'getTargetsVsActuals',
  'getBottlenecks',
  'getActivations',
  'getBrandDetails',
  'getWorkforceLoad',
  'getIndustryBreakdown',
  'getEventPackages',
  'getEventReadiness',
  'getTargetCompanies',
  'getMyAssignedWork',
]);

export const WRITE_TOOL_NAMES = new Set([
  'createTask',
  'updateOpportunityStage',
  'reassignOpportunityOwner',
  'reserveEventPackage',
  'generateDealChecklist',
]);

export const COPILOT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'getFunnel',
    description:
      'Get distinct brand counts at each funnel stage (researched, outreach_sent, engaged_or_qualified, meeting_held, qualified, opportunity_created, partner_confirmed) and deterministic stage conversion rates. Optionally filter as of YYYY-MM-DD (India end-of-day).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        asOf: {
          type: Type.STRING,
          description: 'Optional snapshot date YYYY-MM-DD in Asia/Kolkata.',
        },
      },
    },
  },
  {
    name: 'getCash',
    description:
      'Get deterministic deal economics and cash summary: confirmed deals count, confirmed_value_inr, collected_value_inr (bank receipt), avg_confirmed_deal_inr, open_count, open_pipeline_inr (proposed value only), withdrawn_count/value, lost_count/value.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        asOf: {
          type: Type.STRING,
          description: 'Optional snapshot date YYYY-MM-DD in Asia/Kolkata.',
        },
      },
    },
  },
  {
    name: 'getCampaignPerf',
    description:
      'Get campaign/channel efficiency metrics across all sponsorship acquisition campaigns: interactions, brands_reached, meetings_held_brands, opportunities_created, confirmed_deals, confirmed_value_inr, open_deals, open_pipeline_inr, inr_per_interaction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        asOf: {
          type: Type.STRING,
          description: 'Optional snapshot date YYYY-MM-DD in Asia/Kolkata.',
        },
      },
    },
  },
  {
    name: 'getPipeline',
    description:
      'List partner opportunities with their latest stage, proposed_value_inr, confirmed_value_inr, collected_value_inr, originating campaign, and owner. Supports optional stage and search filters.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        stage: {
          type: Type.STRING,
          description:
            'Optional stage filter: prospecting, contacted, proposal_sent, negotiating, partner_confirmed, lost, withdrawn, or all.',
        },
        search: {
          type: Type.STRING,
          description: 'Optional brand, campaign, or owner search text.',
        },
      },
    },
  },
  {
    name: 'getTargetsVsActuals',
    description:
      'Get versioned sponsorship targets (Sponsor launch plan, Sponsor revised plan) compared with actual qualified brands and confirmed partnerships plus variances.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        asOf: {
          type: Type.STRING,
          description: 'Optional snapshot date YYYY-MM-DD in Asia/Kolkata.',
        },
      },
    },
  },
  {
    name: 'getBottlenecks',
    description:
      'Get active open opportunities ranked by days stalled in their current stage and proposed_value_inr.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        asOf: {
          type: Type.STRING,
          description: 'Optional snapshot date YYYY-MM-DD in Asia/Kolkata.',
        },
      },
    },
  },
  {
    name: 'getActivations',
    description:
      'Get sponsor_activations linking confirmed partnerships to attendee acquisition campaigns. Note: these records show observational association only, never causal uplift.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        brandName: {
          type: Type.STRING,
          description: 'Optional brand name filter (e.g., Beardo).',
        },
      },
    },
  },
  {
    name: 'getBrandDetails',
    description:
      'Look up a specific brand by name or ID to inspect its latest qualification status, interaction count, and opportunities.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        brandQuery: {
          type: Type.STRING,
          description: 'Brand name or brand_id to inspect.',
        },
      },
      required: ['brandQuery'],
    },
  },
  {
    name: 'createTask',
    description:
      'Propose creating an execution task in the Growth Center Tasks queue. Requires explicit user confirmation in the UI before saving.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Clear, actionable task title.' },
        owner_name: { type: Type.STRING, description: 'Responsible team member name.' },
        description: { type: Type.STRING, description: 'Rationale or execution steps.' },
        due_date: { type: Type.STRING, description: 'Optional due date YYYY-MM-DD.' },
        sponsor_campaign_id: {
          type: Type.STRING,
          description: 'Optional campaign ID (e.g., SC01..SC06).',
        },
        brand_id: { type: Type.STRING, description: 'Optional brand_id.' },
        opportunity_id: { type: Type.STRING, description: 'Optional opportunity_id.' },
      },
      required: ['title', 'owner_name'],
    },
  },
  {
    name: 'updateOpportunityStage',
    description:
      'Propose updating an opportunity stage and/or confirmed/collected INR values by appending a new history version. Requires explicit user confirmation in the UI before saving.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        opportunity_id: { type: Type.STRING, description: 'Exact opportunity_id (e.g., O043).' },
        stage: {
          type: Type.STRING,
          description:
            'Target stage: prospecting, contacted, proposal_sent, negotiating, partner_confirmed, lost, withdrawn.',
        },
        proposed_value_inr: { type: Type.NUMBER, description: 'Optional proposed value in whole INR.' },
        confirmed_value_inr: {
          type: Type.NUMBER,
          description: 'Optional confirmed value in whole INR (for partner_confirmed).',
        },
        collected_value_inr: {
          type: Type.NUMBER,
          description: 'Optional cash collected before event in whole INR.',
        },
      },
      required: ['opportunity_id', 'stage'],
    },
  },
  {
    name: 'getCashBreakdown',
    description:
      'Get exact separation of confirmed cash (support_type=cash) vs confirmed in-kind barter (support_type=in_kind), plus collected cash and open pipeline.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getWorkforceLoad',
    description:
      'Get team workload per owner (Kabir Shah, Riya Kapoor, Nisha Rao, Meera Iyer): brands owned, interactions, email touches, open deals, confirmed cash, and open tasks.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getIndustryBreakdown',
    description:
      'Get sponsorship performance by industry vertical (Food and beverage, Mobility, Consumer products, Media, Education, Personal care) showing confirmed deals vs open pipeline.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getEventPackages',
    description:
      'Get the IIT-inspired sponsorship packages (Mood Indigo, Rendezvous, Antaragni, Saarang/Techfest, Spring Fest adaptations), list prices, target industries, and reservation status.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getEventReadiness',
    description:
      'Get pre-event milestones (T-60 to T+7 anchored to 12-13 Apr 2025) and readiness status.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'reassignOpportunityOwner',
    description:
      'Propose reassigning an opportunity to another team owner (appends immutable history). Requires explicit UI user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        opportunity_id: { type: Type.STRING, description: 'Opportunity ID (e.g. O043).' },
        new_owner_name: {
          type: Type.STRING,
          description: 'New owner name (e.g. Riya Kapoor, Nisha Rao, Meera Iyer, Kabir Shah).',
        },
      },
      required: ['opportunity_id', 'new_owner_name'],
    },
  },
  {
    name: 'reserveEventPackage',
    description:
      'Propose attaching an IIT-inspired event package to an opportunity and auto-spawning 4 pre-event tasks. Requires explicit UI user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        package_id: { type: Type.STRING, description: 'Package ID (e.g. PKG_REVERSE_HACK).' },
        opportunity_id: { type: Type.STRING, description: 'Opportunity ID.' },
      },
      required: ['package_id', 'opportunity_id'],
    },
  },
  {
    name: 'generateDealChecklist',
    description:
      'Propose generating the 4 standardized pre-event tasks (50% advance, brand assets, 100% settlement, on-ground check) for an opportunity. Requires explicit UI user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        opportunity_id: { type: Type.STRING, description: 'Opportunity ID.' },
      },
      required: ['opportunity_id'],
    },
  },
  {
    name: 'getTargetCompanies',
    description:
      'Get prospective target companies outside the historical 180-brand dataset, mapped per IIT-style event package (which companies to call for which event).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        package_id: {
          type: Type.STRING,
          description: 'Optional event package ID (e.g. PKG_REVERSE_HACK, PKG_MOBILITY_TRACK).',
        },
        industry: { type: Type.STRING, description: 'Optional industry filter.' },
        outreach_status: {
          type: Type.STRING,
          description: 'Optional status: shortlisted, assigned, contacted, promoted.',
        },
      },
    },
  },
  {
    name: 'getMyAssignedWork',
    description:
      'Get the signed-in teammate’s own assigned tasks, assigned target companies to call, and assigned open opportunities.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

function cleanAsOf(args: Record<string, unknown>): string | null {
  const raw = typeof args.asOf === 'string' ? args.asOf.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const ORG_FINANCE_TOOLS = new Set([
  'getFunnel',
  'getCash',
  'getCashBreakdown',
  'getCampaignPerf',
  'getTargetsVsActuals',
  'getWorkforceLoad',
  'getIndustryBreakdown',
]);

export async function executeReadTool(
  name: string,
  args: Record<string, unknown>,
  principal?: SessionPrincipal
): Promise<unknown> {
  const asOf = cleanAsOf(args);

  if (principal?.role === 'coordinator' && ORG_FINANCE_TOOLS.has(name)) {
    return {
      access_denied: true,
      role: principal.role,
      message: `Access restricted: "${name}" contains org-wide financial/workforce totals reserved for Managers & Heads. Use getMyAssignedWork, getTargetCompanies, getEventPackages, or getEventReadiness instead.`,
    };
  }

  switch (name) {
    case 'getFunnel': {
      const snap = await getMeasureSnapshot(asOf);
      const f = snap.funnel;
      return {
        as_of: snap.meta.as_of ?? 'latest',
        funnel: f,
        conversion_rates: {
          outreach_to_qualified: formatPct(f.qualified_brands, f.outreach_sent_brands),
          qualified_to_confirmed: formatPct(f.confirmed_brands, f.qualified_brands),
          researched_to_confirmed: formatPct(f.confirmed_brands, f.researched_brands),
        },
      };
    }

    case 'getCash': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        currency: 'INR',
        ...snap.cash,
        note: 'confirmed_value_inr is committed sponsorship value; collected_value_inr is bank receipt; open_pipeline_inr is proposed_value_inr only.',
      };
    }

    case 'getCampaignPerf': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        attribution_rule: 'Originating campaign at opportunity creation',
        campaigns: snap.campaigns,
      };
    }

    case 'getPipeline': {
      const stage = typeof args.stage === 'string' ? args.stage : 'all';
      const search = typeof args.search === 'string' ? args.search : null;
      const res = await listPipelineOpportunities({ stage, search, limit: 60, offset: 0 });
      const items =
        principal?.role === 'coordinator'
          ? res.items.filter((o) => o.owner_name === principal.full_name)
          : res.items;
      return {
        total_matching: items.length,
        returned: items.length,
        scope: principal?.role === 'coordinator' ? 'coordinator_assigned_only' : 'all',
        opportunities: items,
      };
    }

    case 'getTargetsVsActuals': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        targets: snap.targets,
      };
    }

    case 'getBottlenecks': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        open_stalled_count: snap.bottlenecks.length,
        top_stalled_opportunities: snap.bottlenecks.slice(0, 15),
      };
    }

    case 'getActivations': {
      const snap = await getMeasureSnapshot(asOf);
      const q = typeof args.brandName === 'string' ? args.brandName.trim().toLowerCase() : '';
      const filtered = q
        ? snap.activations.filter((a) => a.brand_name.toLowerCase().includes(q))
        : snap.activations;
      return {
        causal_uplift_evidence: false,
        epistemic_limit:
          'Sponsor activations record observational links between confirmed partnerships and attendee campaigns. There is NO control group or attendee uplift measurement in this dataset.',
        activations: filtered,
      };
    }

    case 'getBrandDetails': {
      const q = typeof args.brandQuery === 'string' ? args.brandQuery.trim().toLowerCase() : '';
      if (!q) return { error: 'brandQuery is required' };

      if (!isSupabaseConfigured()) {
        const ds = getMergedLocalDataset();
        const matches = ds.brands.filter(
          (b) => b.brand_id.toLowerCase() === q || b.brand_name.toLowerCase().includes(q)
        );
        if (matches.length === 0) {
          return { found: false, message: `No brand matching "${args.brandQuery}" in dataset.` };
        }
        const latestQual = latestByEntity(ds.brand_qualification, (r) => r.brand_id);
        const latestOpp = latestByEntity(ds.opportunity_history, (r) => r.opportunity_id);
        return {
          found: true,
          brands: matches.slice(0, 5).map((b) => ({
            ...b,
            latest_qualification: latestQual.get(b.brand_id) ?? null,
            interaction_count: ds.sponsor_interactions.filter((i) => i.brand_id === b.brand_id)
              .length,
            opportunities: Array.from(latestOpp.values()).filter((o) => o.brand_id === b.brand_id),
            activations: ds.sponsor_activations.filter((a) => a.brand_id === b.brand_id),
          })),
        };
      }

      const supabase = getServerSupabase();
      const { data: brands } = await supabase
        .from('brands')
        .select('*')
        .or(`brand_id.ilike.${q},brand_name.ilike.%${q}%`)
        .limit(5);
      if (!brands || brands.length === 0) {
        return { found: false, message: `No brand matching "${args.brandQuery}" in dataset.` };
      }
      const brandIds = brands.map((b) => b.brand_id);
      const [qualRes, oppRes, actRes] = await Promise.all([
        supabase.from('v_latest_brand_qualification').select('*').in('brand_id', brandIds),
        supabase.from('v_latest_opportunity_state').select('*').in('brand_id', brandIds),
        supabase.from('sponsor_activations').select('*').in('brand_id', brandIds),
      ]);
      return {
        found: true,
        brands: brands.map((b) => ({
          ...b,
          latest_qualification:
            (qualRes.data ?? []).find((x) => x.brand_id === b.brand_id) ?? null,
          opportunities: (oppRes.data ?? []).filter((x) => x.brand_id === b.brand_id),
          activations: (actRes.data ?? []).filter((x) => x.brand_id === b.brand_id),
        })),
      };
    }

    case 'getCashBreakdown': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        currency: 'INR',
        ...snap.cash_breakdown,
        note: 'Only support_type=cash counts as sponsorship cash; in_kind deals are barter/goods.',
      };
    }

    case 'getWorkforceLoad': {
      const wf = await getWorkforceWorkload();
      return {
        owners: wf.owners,
      };
    }

    case 'getIndustryBreakdown': {
      const snap = await getMeasureSnapshot(asOf);
      return {
        as_of: snap.meta.as_of ?? 'latest',
        industries: snap.industries,
      };
    }

    case 'getEventPackages': {
      const pkgs = await listEventPackages();
      return {
        event_dates: '2025-04-12 to 2025-04-13 (CampusFest 2025)',
        packages: pkgs.packages,
      };
    }

    case 'getEventReadiness': {
      const miles = await listEventMilestones();
      return {
        event_dates: '2025-04-12 to 2025-04-13',
        milestones: miles.milestones,
      };
    }

    case 'getTargetCompanies': {
      const res = await listTargetCompanies({
        package_id: typeof args.package_id === 'string' ? args.package_id : null,
        industry: typeof args.industry === 'string' ? args.industry : null,
        outreach_status: typeof args.outreach_status === 'string' ? args.outreach_status : null,
        assigned_to_member_id:
          principal?.role === 'coordinator' ? principal.member_id : null,
      });
      return {
        scope: principal?.role === 'coordinator' ? 'assigned_to_me' : 'all_targets',
        count: res.items.length,
        target_companies: res.items,
      };
    }

    case 'getMyAssignedWork': {
      const name = principal?.full_name ?? 'Aarav Mehta';
      const memberId = principal?.member_id ?? 'T_HEAD';
      const [tasksRes, targetsRes, pipeRes] = await Promise.all([
        listTasks({ limit: 100 }),
        listTargetCompanies({ assigned_to_member_id: memberId }),
        listPipelineOpportunities({ limit: 100 }),
      ]);
      const myTasks = tasksRes.items.filter((t) => t.owner_name === name);
      const myOpps = pipeRes.items.filter((o) => o.owner_name === name);
      return {
        member: { member_id: memberId, full_name: name, role: principal?.role ?? 'head' },
        assigned_tasks: myTasks,
        assigned_target_companies: targetsRes.items,
        assigned_opportunities: myOpps,
      };
    }

    default:
      throw new Error(`Unknown read tool: ${name}`);
  }
}

export async function preparePendingWriteAction(
  name: string,
  args: Record<string, unknown>,
  idx: number,
  principal?: SessionPrincipal
): Promise<{ pending: PendingCopilotAction | null; toolResultForModel: unknown }> {
  if (principal?.role === 'coordinator') {
    return {
      pending: null,
      toolResultForModel: {
        status: 'access_denied',
        error: `Role "coordinator" cannot propose "${name}". Ask a Manager or Head to approve task assignments, stage changes, or package reservations.`,
      },
    };
  }
  if (name === 'createTask') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    const owner_name = typeof args.owner_name === 'string' ? args.owner_name.trim() : '';
    if (!title || !owner_name) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: 'Both title and owner_name are required to propose a task.',
        },
      };
    }
    const payload = {
      title,
      owner_name,
      description: typeof args.description === 'string' ? args.description.trim() : '',
      due_date: typeof args.due_date === 'string' ? args.due_date.trim() : null,
      sponsor_campaign_id:
        typeof args.sponsor_campaign_id === 'string' ? args.sponsor_campaign_id.trim() : null,
      brand_id: typeof args.brand_id === 'string' ? args.brand_id.trim() : null,
      opportunity_id:
        typeof args.opportunity_id === 'string' ? args.opportunity_id.trim() : null,
    };
    const actionId = `act_${Date.now()}_${idx}`;
    return {
      pending: {
        actionId,
        tool: 'createTask',
        summary: `Create task "${title}" assigned to ${owner_name}${payload.due_date ? ` (due ${payload.due_date})` : ''}`,
        payload,
      },
      toolResultForModel: {
        status: 'pending_user_confirmation',
        message:
          'Task creation queued for explicit user confirmation in the UI. Tell the user to click Confirm & Execute to save it.',
        proposed_task: payload,
      },
    };
  }

  if (name === 'updateOpportunityStage') {
    const opportunity_id =
      typeof args.opportunity_id === 'string' ? args.opportunity_id.trim() : '';
    const stage = typeof args.stage === 'string' ? (args.stage.trim() as OpportunityStage) : null;
    if (!opportunity_id || !stage || !VALID_STAGES.includes(stage)) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: `Valid opportunity_id and stage (${VALID_STAGES.join(', ')}) are required.`,
        },
      };
    }

    const pipe = await listPipelineOpportunities({ limit: 200 });
    const existing = pipe.items.find((o) => o.opportunity_id === opportunity_id);
    if (!existing) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: `Opportunity ${opportunity_id} does not exist.`,
        },
      };
    }

    const proposed =
      typeof args.proposed_value_inr === 'number'
        ? Math.max(0, Math.round(args.proposed_value_inr))
        : existing.proposed_value_inr;
    const confirmed =
      stage === 'partner_confirmed'
        ? typeof args.confirmed_value_inr === 'number'
          ? Math.max(0, Math.round(args.confirmed_value_inr))
          : existing.confirmed_value_inr > 0
            ? existing.confirmed_value_inr
            : proposed
        : 0;
    const collected =
      stage === 'partner_confirmed' && typeof args.collected_value_inr === 'number'
        ? Math.max(0, Math.round(args.collected_value_inr))
        : existing.collected_value_inr;

    const payload = {
      opportunity_id,
      stage,
      proposed_value_inr: proposed,
      confirmed_value_inr: confirmed,
      collected_value_inr: collected,
    };

    const actionId = `act_${Date.now()}_${idx}`;
    return {
      pending: {
        actionId,
        tool: 'updateOpportunityStage',
        summary: `Move ${existing.brand_name} (${opportunity_id}) from ${existing.stage} → ${stage} (confirmed: ₹${confirmed.toLocaleString('en-IN')})`,
        payload,
      },
      toolResultForModel: {
        status: 'pending_user_confirmation',
        message:
          'Stage update queued for explicit user confirmation in the UI. Tell the user to click Confirm & Execute to append this version.',
        current: {
          brand_name: existing.brand_name,
          stage: existing.stage,
          proposed_value_inr: existing.proposed_value_inr,
          confirmed_value_inr: existing.confirmed_value_inr,
        },
        proposed: payload,
      },
    };
  }

  if (name === 'reassignOpportunityOwner') {
    const opportunity_id =
      typeof args.opportunity_id === 'string' ? args.opportunity_id.trim() : '';
    const new_owner_name =
      typeof args.new_owner_name === 'string' ? args.new_owner_name.trim() : '';
    if (!opportunity_id || !new_owner_name) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: 'opportunity_id and new_owner_name are required.',
        },
      };
    }
    const pipe = await listPipelineOpportunities({ limit: 200 });
    const existing = pipe.items.find((o) => o.opportunity_id === opportunity_id);
    if (!existing) {
      return {
        pending: null,
        toolResultForModel: { status: 'validation_error', error: `Opportunity ${opportunity_id} not found.` },
      };
    }
    const actionId = `act_${Date.now()}_${idx}`;
    return {
      pending: {
        actionId,
        tool: 'reassignOpportunityOwner',
        summary: `Reassign ${existing.brand_name} (${opportunity_id}) from ${existing.owner_name} → ${new_owner_name}`,
        payload: { opportunity_id, new_owner_name, stage: existing.stage },
      },
      toolResultForModel: {
        status: 'pending_user_confirmation',
        message: 'Owner reassignment queued for user confirmation.',
      },
    };
  }

  if (name === 'reserveEventPackage') {
    const package_id = typeof args.package_id === 'string' ? args.package_id.trim() : '';
    const opportunity_id =
      typeof args.opportunity_id === 'string' ? args.opportunity_id.trim() : '';
    if (!package_id || !opportunity_id) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: 'package_id and opportunity_id are required.',
        },
      };
    }
    const [pkgs, pipe] = await Promise.all([
      listEventPackages(),
      listPipelineOpportunities({ limit: 200 }),
    ]);
    const pkg = pkgs.packages.find((p) => p.package_id === package_id);
    const opp = pipe.items.find((o) => o.opportunity_id === opportunity_id);
    if (!pkg || !opp) {
      return {
        pending: null,
        toolResultForModel: {
          status: 'validation_error',
          error: 'Valid package_id and opportunity_id are required.',
        },
      };
    }
    const actionId = `act_${Date.now()}_${idx}`;
    return {
      pending: {
        actionId,
        tool: 'reserveEventPackage',
        summary: `Attach "${pkg.package_name}" to ${opp.brand_name} (${opp.opportunity_id}) and spawn 4 pre-event tasks`,
        payload: { package_id, opportunity_id },
      },
      toolResultForModel: {
        status: 'pending_user_confirmation',
        message: 'Package reservation + 4-task checklist queued for user confirmation.',
      },
    };
  }

  if (name === 'generateDealChecklist') {
    const opportunity_id =
      typeof args.opportunity_id === 'string' ? args.opportunity_id.trim() : '';
    const pipe = await listPipelineOpportunities({ limit: 200 });
    const opp = pipe.items.find((o) => o.opportunity_id === opportunity_id);
    if (!opp) {
      return {
        pending: null,
        toolResultForModel: { status: 'validation_error', error: `Opportunity ${opportunity_id} not found.` },
      };
    }
    const actionId = `act_${Date.now()}_${idx}`;
    return {
      pending: {
        actionId,
        tool: 'generateDealChecklist',
        summary: `Generate 4 pre-event cash & ops tasks for ${opp.brand_name} (${opp.opportunity_id}, owner: ${opp.owner_name})`,
        payload: { opportunity_id },
      },
      toolResultForModel: {
        status: 'pending_user_confirmation',
        message: '4-task pre-event checklist queued for user confirmation.',
      },
    };
  }

  return {
    pending: null,
    toolResultForModel: { status: 'error', error: `Unsupported write tool ${name}` },
  };
}
