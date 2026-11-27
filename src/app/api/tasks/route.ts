import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  createTask,
  generateDealChecklist,
  listReferenceOptions,
  listTasks,
} from '@/lib/repository';
import { notifyAssigneeForTask } from '@/lib/whatsapp';
import type { TaskCategory, TaskPriority, TaskStatus } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Number(sp.get('limit') ?? '100');
    const offset = Number(sp.get('offset') ?? '0');

    const [tasks, refs] = await Promise.all([
      listTasks({ limit, offset }),
      listReferenceOptions(),
    ]);

    const items =
      auth.principal.role === 'coordinator'
        ? tasks.items.filter((t) => t.owner_name === auth.principal.full_name)
        : tasks.items;

    return NextResponse.json({ ...tasks, items, total: items.length, refs });
  } catch (err) {
    console.error('[GET /api/tasks] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list tasks' },
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

    if (body.action === 'generate_checklist') {
      const opportunity_id =
        typeof body.opportunity_id === 'string' ? body.opportunity_id.trim() : '';
      if (!opportunity_id) {
        return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 });
      }
      const tasks = await generateDealChecklist({
        opportunity_id,
        package_id: typeof body.package_id === 'string' ? body.package_id : null,
        created_by: 'user',
      });
      await Promise.all(tasks.map((t) => notifyAssigneeForTask(t)));
      return NextResponse.json({ ok: true, tasks }, { status: 201 });
    }

    const title = typeof body.title === 'string' ? body.title : '';
    const owner_name = typeof body.owner_name === 'string' ? body.owner_name : '';

    if (!title.trim() || !owner_name.trim()) {
      return NextResponse.json({ error: 'title and owner_name are required' }, { status: 400 });
    }

    const task = await createTask({
      title,
      description: typeof body.description === 'string' ? body.description : '',
      owner_name,
      due_date: typeof body.due_date === 'string' ? body.due_date : null,
      status: typeof body.status === 'string' ? (body.status as TaskStatus) : 'todo',
      priority: typeof body.priority === 'string' ? (body.priority as TaskPriority) : 'p1',
      category: typeof body.category === 'string' ? (body.category as TaskCategory) : 'closing',
      package_id: typeof body.package_id === 'string' ? body.package_id : null,
      brand_id: typeof body.brand_id === 'string' ? body.brand_id : null,
      sponsor_campaign_id:
        typeof body.sponsor_campaign_id === 'string' ? body.sponsor_campaign_id : null,
      opportunity_id: typeof body.opportunity_id === 'string' ? body.opportunity_id : null,
      created_by: body.created_by === 'copilot' ? 'copilot' : 'user',
      idempotency_key: typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined,
    });

    await notifyAssigneeForTask(task);
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create task' },
      { status: 400 }
    );
  }
}
