import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  appendOpportunityUpdate,
  getWorkforceWorkload,
  listPipelineOpportunities,
} from '@/lib/repository';

export async function GET() {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const [workload, pipeline] = await Promise.all([
      getWorkforceWorkload(),
      listPipelineOpportunities({ limit: 200 }),
    ]);
    const openOpps = pipeline.items.filter((o) =>
      ['prospecting', 'contacted', 'proposal_sent', 'negotiating'].includes(o.stage)
    );
    return NextResponse.json({
      ...workload,
      open_opportunities: openOpps,
    });
  } catch (err) {
    console.error('[GET /api/workforce] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load workforce' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as {
      opportunity_id?: string;
      new_owner_name?: string;
      idempotency_key?: string;
    };
    const opportunity_id = body.opportunity_id?.trim() ?? '';
    const new_owner_name = body.new_owner_name?.trim() ?? '';

    if (!opportunity_id || !new_owner_name) {
      return NextResponse.json(
        { error: 'opportunity_id and new_owner_name are required' },
        { status: 400 }
      );
    }

    const pipe = await listPipelineOpportunities({ limit: 200 });
    const current = pipe.items.find((o) => o.opportunity_id === opportunity_id);
    if (!current) {
      return NextResponse.json({ error: `Opportunity ${opportunity_id} not found` }, { status: 404 });
    }

    const result = await appendOpportunityUpdate({
      opportunity_id,
      stage: current.stage,
      owner_name: new_owner_name,
      idempotency_key: body.idempotency_key,
    });

    const workload = await getWorkforceWorkload();
    return NextResponse.json({ ok: true, ...result, owners: workload.owners });
  } catch (err) {
    console.error('[POST /api/workforce] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reassign owner' },
      { status: 400 }
    );
  }
}
