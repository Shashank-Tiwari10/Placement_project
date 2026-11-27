import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  listEventMilestones,
  listEventPackages,
  listPipelineOpportunities,
  reserveEventPackage,
  updateEventMilestoneStatus,
} from '@/lib/repository';
import type { EventMilestoneRow } from '@/lib/types';

export async function GET() {
  try {
    const [pkgs, miles, pipe] = await Promise.all([
      listEventPackages(),
      listEventMilestones(),
      listPipelineOpportunities({ limit: 200 }),
    ]);

    return NextResponse.json({
      mode: pkgs.mode,
      packages: pkgs.packages,
      milestones: miles.milestones,
      opportunities: pipe.items,
    });
  } catch (err) {
    console.error('[GET /api/events] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load event planning data' },
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
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'reserve_package') {
      const package_id = typeof body.package_id === 'string' ? body.package_id.trim() : '';
      const opportunity_id =
        typeof body.opportunity_id === 'string' ? body.opportunity_id.trim() : '';
      const status =
        body.status === 'sold' || body.status === 'delivered' ? body.status : 'reserved';
      if (!package_id || !opportunity_id) {
        return NextResponse.json(
          { error: 'package_id and opportunity_id are required' },
          { status: 400 }
        );
      }
      const res = await reserveEventPackage({ package_id, opportunity_id, status });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === 'update_milestone') {
      const milestone_id = typeof body.milestone_id === 'string' ? body.milestone_id.trim() : '';
      const status = typeof body.status === 'string' ? (body.status as EventMilestoneRow['status']) : null;
      if (!milestone_id || !status) {
        return NextResponse.json(
          { error: 'milestone_id and status are required' },
          { status: 400 }
        );
      }
      const milestone = await updateEventMilestoneStatus(milestone_id, status);
      return NextResponse.json({ ok: true, milestone });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/events] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Event update failed' },
      { status: 400 }
    );
  }
}
