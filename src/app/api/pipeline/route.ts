import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  appendOpportunityUpdate,
  getMeasureSnapshot,
  listPipelineOpportunities,
  VALID_STAGES,
} from '@/lib/repository';
import type { OpportunityStage } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const sp = request.nextUrl.searchParams;
    const stage = sp.get('stage');
    const search = sp.get('search');
    const limit = Number(sp.get('limit') ?? '100');
    const offset = Number(sp.get('offset') ?? '0');

    const [pipeline, snapshot] = await Promise.all([
      listPipelineOpportunities({ stage, search, limit, offset }),
      getMeasureSnapshot(null),
    ]);

    const items =
      auth.principal.role === 'coordinator'
        ? pipeline.items.filter((o) => o.owner_name === auth.principal.full_name)
        : pipeline.items;

    return NextResponse.json({
      ...pipeline,
      items,
      total: items.length,
      cash: auth.principal.role === 'coordinator' ? null : snapshot.cash,
      funnel: auth.principal.role === 'coordinator' ? null : snapshot.funnel,
    });
  } catch (err) {
    console.error('[GET /api/pipeline] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load pipeline' },
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
    const body = (await request.json()) as Record<string, unknown>;
    const opportunity_id = typeof body.opportunity_id === 'string' ? body.opportunity_id.trim() : '';
    const stage = typeof body.stage === 'string' ? (body.stage.trim() as OpportunityStage) : null;

    if (!opportunity_id || !stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: 'Valid opportunity_id and stage are required.' },
        { status: 400 }
      );
    }

    const toOptionalInt = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error('INR values must be non-negative numbers');
      return Math.round(n);
    };

    const result = await appendOpportunityUpdate({
      opportunity_id,
      stage,
      proposed_value_inr: toOptionalInt(body.proposed_value_inr),
      confirmed_value_inr: toOptionalInt(body.confirmed_value_inr),
      collected_value_inr: toOptionalInt(body.collected_value_inr),
      owner_name: typeof body.owner_name === 'string' ? body.owner_name : undefined,
      idempotency_key: typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined,
    });

    const snapshot = await getMeasureSnapshot(null);

    return NextResponse.json({
      ok: true,
      ...result,
      cash: snapshot.cash,
      funnel: snapshot.funnel,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update opportunity';
    const isClientErr =
      msg.includes('not found') ||
      msg.includes('cannot exceed') ||
      msg.includes('Invalid') ||
      msg.includes('non-negative');
    console.error('[POST /api/pipeline] failed:', err);
    return NextResponse.json({ error: msg }, { status: isClientErr ? 400 : 500 });
  }
}
