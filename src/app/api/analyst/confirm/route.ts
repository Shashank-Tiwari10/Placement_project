import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  appendOpportunityUpdate,
  createTask,
  generateDealChecklist,
  getMeasureSnapshot,
  reserveEventPackage,
  VALID_STAGES,
} from '@/lib/repository';
import { notifyAssigneeForTask } from '@/lib/whatsapp';
import type { OpportunityStage } from '@/lib/types';

export async function POST(request: NextRequest) {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as {
      actionId?: string;
      tool?: string;
      payload?: Record<string, unknown>;
    };

    const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
    const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
    const payload = body.payload ?? {};

    if (!actionId || !tool) {
      return NextResponse.json({ error: 'actionId and tool are required' }, { status: 400 });
    }

    if (tool === 'createTask') {
      const title = typeof payload.title === 'string' ? payload.title : '';
      const owner_name = typeof payload.owner_name === 'string' ? payload.owner_name : '';
      if (!title.trim() || !owner_name.trim()) {
        return NextResponse.json({ error: 'Invalid task payload' }, { status: 400 });
      }
      const task = await createTask({
        title,
        owner_name,
        description: typeof payload.description === 'string' ? payload.description : '',
        due_date: typeof payload.due_date === 'string' ? payload.due_date : null,
        sponsor_campaign_id:
          typeof payload.sponsor_campaign_id === 'string' ? payload.sponsor_campaign_id : null,
        brand_id: typeof payload.brand_id === 'string' ? payload.brand_id : null,
        opportunity_id:
          typeof payload.opportunity_id === 'string' ? payload.opportunity_id : null,
        created_by: 'copilot',
        idempotency_key: actionId,
      });
      await notifyAssigneeForTask(task);
      return NextResponse.json({ ok: true, tool, task });
    }

    if (tool === 'updateOpportunityStage') {
      const opportunity_id =
        typeof payload.opportunity_id === 'string' ? payload.opportunity_id : '';
      const stage = typeof payload.stage === 'string' ? (payload.stage as OpportunityStage) : null;
      if (!opportunity_id || !stage || !VALID_STAGES.includes(stage)) {
        return NextResponse.json({ error: 'Invalid opportunity update payload' }, { status: 400 });
      }
      const updated = await appendOpportunityUpdate({
        opportunity_id,
        stage,
        proposed_value_inr:
          typeof payload.proposed_value_inr === 'number' ? payload.proposed_value_inr : undefined,
        confirmed_value_inr:
          typeof payload.confirmed_value_inr === 'number'
            ? payload.confirmed_value_inr
            : undefined,
        collected_value_inr:
          typeof payload.collected_value_inr === 'number'
            ? payload.collected_value_inr
            : undefined,
        idempotency_key: actionId,
      });

      const snapshot = await getMeasureSnapshot(null);
      return NextResponse.json({
        ok: true,
        tool,
        updated,
        cash: snapshot.cash,
        funnel: snapshot.funnel,
      });
    }

    if (tool === 'reassignOpportunityOwner') {
      const opportunity_id =
        typeof payload.opportunity_id === 'string' ? payload.opportunity_id : '';
      const new_owner_name =
        typeof payload.new_owner_name === 'string' ? payload.new_owner_name : '';
      const stage = typeof payload.stage === 'string' ? (payload.stage as OpportunityStage) : null;
      if (!opportunity_id || !new_owner_name || !stage || !VALID_STAGES.includes(stage)) {
        return NextResponse.json({ error: 'Invalid reassignment payload' }, { status: 400 });
      }
      const updated = await appendOpportunityUpdate({
        opportunity_id,
        stage,
        owner_name: new_owner_name,
        idempotency_key: actionId,
      });
      return NextResponse.json({ ok: true, tool, updated });
    }

    if (tool === 'reserveEventPackage') {
      const package_id = typeof payload.package_id === 'string' ? payload.package_id : '';
      const opportunity_id =
        typeof payload.opportunity_id === 'string' ? payload.opportunity_id : '';
      if (!package_id || !opportunity_id) {
        return NextResponse.json({ error: 'Invalid package reservation payload' }, { status: 400 });
      }
      const res = await reserveEventPackage({ package_id, opportunity_id, status: 'reserved' });
      return NextResponse.json({ ok: true, tool, ...res });
    }

    if (tool === 'generateDealChecklist') {
      const opportunity_id =
        typeof payload.opportunity_id === 'string' ? payload.opportunity_id : '';
      if (!opportunity_id) {
        return NextResponse.json({ error: 'Invalid checklist payload' }, { status: 400 });
      }
      const tasks = await generateDealChecklist({ opportunity_id, created_by: 'copilot' });
      return NextResponse.json({ ok: true, tool, tasks });
    }

    return NextResponse.json({ error: `Unsupported tool: ${tool}` }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/analyst/confirm] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to confirm action' },
      { status: 400 }
    );
  }
}
