import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  createTargetCompany,
  listEventPackages,
  listTargetCompanies,
  listTeamMembers,
  promoteTargetToPipeline,
  updateTargetCompany,
} from '@/lib/repository';
import type { TargetOutreachStatus, TaskPriority } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const sp = request.nextUrl.searchParams;
    const [targetsRes, pkgsRes, members] = await Promise.all([
      listTargetCompanies({
        package_id: sp.get('package_id'),
        industry: sp.get('industry'),
        outreach_status: sp.get('outreach_status'),
        assigned_to_member_id:
          auth.principal.role === 'coordinator' ? auth.principal.member_id : null,
      }),
      listEventPackages(),
      listTeamMembers(),
    ]);

    return NextResponse.json({
      mode: targetsRes.mode,
      items: targetsRes.items,
      packages: pkgsRes.packages,
      members,
    });
  } catch (err) {
    console.error('[GET /api/targets] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load target companies' },
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

    if (body.action === 'promote') {
      const target_id = typeof body.target_id === 'string' ? body.target_id.trim() : '';
      if (!target_id) {
        return NextResponse.json({ error: 'target_id is required' }, { status: 400 });
      }
      const res = await promoteTargetToPipeline(target_id, auth.principal.full_name);
      return NextResponse.json({ ok: true, ...res });
    }

    const company_name = typeof body.company_name === 'string' ? body.company_name : '';
    const industry = typeof body.industry === 'string' ? body.industry : 'Consumer products';
    const package_id = typeof body.package_id === 'string' ? body.package_id : '';
    const fit_rationale = typeof body.fit_rationale === 'string' ? body.fit_rationale : '';

    if (!company_name.trim() || !package_id.trim() || !fit_rationale.trim()) {
      return NextResponse.json(
        { error: 'company_name, package_id, and fit_rationale are required' },
        { status: 400 }
      );
    }

    const created = await createTargetCompany({
      company_name,
      industry,
      city: typeof body.city === 'string' ? body.city : 'Delhi NCR',
      package_id,
      fit_rationale,
      estimated_ticket_inr: Number(body.estimated_ticket_inr ?? 100_000),
      contact_role_hint:
        typeof body.contact_role_hint === 'string'
          ? body.contact_role_hint
          : 'Brand Marketing Lead',
      priority: typeof body.priority === 'string' ? (body.priority as TaskPriority) : 'p1',
      assigned_to_member_id:
        typeof body.assigned_to_member_id === 'string' && body.assigned_to_member_id
          ? body.assigned_to_member_id
          : null,
    });

    return NextResponse.json({ ok: true, target: created }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/targets] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process target company' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const target_id = typeof body.target_id === 'string' ? body.target_id.trim() : '';
    if (!target_id) {
      return NextResponse.json({ error: 'target_id is required' }, { status: 400 });
    }

    if (auth.principal.role === 'coordinator') {
      const list = await listTargetCompanies({
        assigned_to_member_id: auth.principal.member_id,
      });
      if (!list.items.some((t) => t.target_id === target_id)) {
        return NextResponse.json(
          { error: 'Coordinators can only update their assigned target companies.' },
          { status: 403 }
        );
      }
      if (body.assigned_to_member_id !== undefined) {
        return NextResponse.json(
          { error: 'Coordinators cannot reassign target companies.' },
          { status: 403 }
        );
      }
    }

    const updated = await updateTargetCompany(target_id, {
      outreach_status:
        typeof body.outreach_status === 'string'
          ? (body.outreach_status as TargetOutreachStatus)
          : undefined,
      assigned_to_member_id:
        body.assigned_to_member_id === null || typeof body.assigned_to_member_id === 'string'
          ? body.assigned_to_member_id
          : undefined,
    });

    return NextResponse.json({ ok: true, target: updated });
  } catch (err) {
    console.error('[PATCH /api/targets] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update target company' },
      { status: 400 }
    );
  }
}
