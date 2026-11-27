import { NextRequest, NextResponse } from 'next/server';
import { getOpportunityAuditTrail } from '@/lib/repository';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const history = await getOpportunityAuditTrail(id);
    return NextResponse.json({ opportunity_id: id, history });
  } catch (err) {
    console.error('[GET /api/pipeline/[id]/history] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load history' },
      { status: 500 }
    );
  }
}
