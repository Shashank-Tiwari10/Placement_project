import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { deleteTask, listTasks, updateTaskStatus } from '@/lib/repository';
import type { TaskCategory, TaskPriority, TaskStatus } from '@/lib/types';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { id } = await context.params;
    if (auth.principal.role === 'coordinator') {
      const existing = (await listTasks({ limit: 200 })).items.find((t) => t.id === id);
      if (!existing || existing.owner_name !== auth.principal.full_name) {
        return NextResponse.json(
          { error: 'Coordinators can only update their own assigned tasks.' },
          { status: 403 }
        );
      }
    }
    const body = (await request.json()) as Record<string, unknown>;

    const updated = await updateTaskStatus(id, {
      status: typeof body.status === 'string' ? (body.status as TaskStatus) : undefined,
      priority: typeof body.priority === 'string' ? (body.priority as TaskPriority) : undefined,
      category: typeof body.category === 'string' ? (body.category as TaskCategory) : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      owner_name: typeof body.owner_name === 'string' ? body.owner_name : undefined,
      due_date:
        body.due_date === null || typeof body.due_date === 'string' ? body.due_date : undefined,
    });

    return NextResponse.json({ ok: true, task: updated });
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update task' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { id } = await context.params;
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/[id]] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete task' },
      { status: 400 }
    );
  }
}
